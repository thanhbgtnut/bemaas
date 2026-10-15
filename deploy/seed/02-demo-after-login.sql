-- Dữ liệu mẫu cần người dùng thật: chạy SAU KHI admin@, truongphong@, nhanvien@maas.local đã đăng nhập ít nhất một lần
-- (bemaas tạo app_user từ claim `sub` của Keycloak khi đăng nhập).
-- Gán quản trị phòng, thành viên, tạo 2 key và 30 ngày dữ liệu sử dụng giả lập.

DO $$
DECLARE
  v_admin text; v_lead text; v_staff text; v_dept uuid; v_app uuid; v_member uuid; d int; m text;
BEGIN
  SELECT id INTO v_admin FROM app_user WHERE email = 'admin@maas.local';
  SELECT id INTO v_lead  FROM app_user WHERE email = 'truongphong@maas.local';
  SELECT id INTO v_staff FROM app_user WHERE email = 'nhanvien@maas.local';
  IF v_admin IS NULL OR v_lead IS NULL OR v_staff IS NULL THEN
    RAISE EXCEPTION 'Cần đăng nhập bằng cả 3 tài khoản mẫu trước khi chạy script này';
  END IF;
  IF EXISTS (SELECT 1 FROM api_key WHERE name = 'tro-ly-lap-trinh-prod') THEN
    RAISE NOTICE 'Đã có dữ liệu mẫu, bỏ qua';
    RETURN;
  END IF;

  SELECT id INTO v_dept FROM department WHERE name = 'Phòng Phát triển Kênh số';
  INSERT INTO department_admin VALUES (v_dept, v_lead) ON CONFLICT DO NOTHING;
  INSERT INTO member (department_id, user_id) VALUES (v_dept, v_lead), (v_dept, v_staff) ON CONFLICT DO NOTHING;

  INSERT INTO api_key (department_id, kind, name, key_hash, last4, monthly_limit_usd, allowed_models, status, created_by, claimed_at)
  VALUES (v_dept, 'app', 'tro-ly-lap-trinh-prod', 'sha256:' || encode(sha256(gen_random_uuid()::text::bytea), 'hex'), 'a41f',
          180, '{code-llm,llm-noi-bo,embed-vi}', 'active', v_lead, now())
  RETURNING id INTO v_app;
  INSERT INTO api_key (department_id, kind, owner_user_id, name, monthly_limit_usd, allowed_models, status, created_by, expires_at)
  VALUES (v_dept, 'member', v_staff, 'minh-ide', 40, '{code-llm,llm-noi-bo}', 'pending', v_lead, now() + interval '90 days')
  RETURNING id INTO v_member;

  FOR d IN 0..29 LOOP
    FOREACH m IN ARRAY ARRAY['code-llm','llm-noi-bo','embed-vi'] LOOP
      INSERT INTO usage_event (request_id, ts, key_id, department_id, model_id, input_tokens, cache_tokens, output_tokens, cost_usd)
      SELECT 'demo-' || d || '-' || m || '-' || g, now() - make_interval(days => d, mins => g * 7), v_app, v_dept, m,
             it, ct, ot,
             round((it * p.input + ct * p.cache_read + ot * p.output) / 1000000.0, 6)
      FROM generate_series(1, 20) g
      CROSS JOIN LATERAL (SELECT 1500 + (random() * 3000)::int AS it, (random() * 800)::int AS ct,
                                 CASE WHEN m = 'embed-vi' THEN 0 ELSE 300 + (random() * 900)::int END AS ot) r
      JOIN model_price p ON p.model_id = m;
    END LOOP;
  END LOOP;

  -- usage_month tổng hợp lại từ usage_event theo kỳ Asia/Ho_Chi_Minh.
  INSERT INTO usage_month (period, key_id, department_id, model_id, requests, input_tokens, cache_tokens, output_tokens, pages, cost_usd)
  SELECT to_char(ts AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM'), key_id, department_id, model_id, count(*),
         sum(input_tokens), sum(cache_tokens), sum(output_tokens), sum(pages), sum(cost_usd)
  FROM usage_event WHERE key_id = v_app GROUP BY 1, 2, 3, 4
  ON CONFLICT (period, key_id, model_id) DO UPDATE SET requests = EXCLUDED.requests, input_tokens = EXCLUDED.input_tokens,
     cache_tokens = EXCLUDED.cache_tokens, output_tokens = EXCLUDED.output_tokens, pages = EXCLUDED.pages, cost_usd = EXCLUDED.cost_usd;
END $$;
