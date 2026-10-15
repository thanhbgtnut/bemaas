// Package cache bọc Redis. Cache không phải nguồn dữ liệu gốc: Redis lỗi thì
// gọi hàm nạp từ PostgreSQL và trả kết quả bình thường (mục 15).
package cache

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"

	"bemaas/internal/config"
)

type Cache struct {
	rdb    *redis.Client
	prefix string
}

func New(cfg config.Redis) *Cache {
	return &Cache{
		rdb:    redis.NewClient(&redis.Options{Addr: cfg.Addr, Password: cfg.Password, DB: cfg.DB}),
		prefix: cfg.Prefix,
	}
}

func (c *Cache) Ping(ctx context.Context) error { return c.rdb.Ping(ctx).Err() }
func (c *Cache) Close() error                   { return c.rdb.Close() }

// Get đọc khoá key vào dst; trả false nếu không có hoặc Redis lỗi.
func (c *Cache) Get(ctx context.Context, key string, dst any) bool {
	b, err := c.rdb.Get(ctx, c.prefix+key).Bytes()
	if err != nil {
		if !errors.Is(err, redis.Nil) {
			slog.Warn("redis get lỗi, đọc thẳng CSDL", "key", key, "err", err)
		}
		return false
	}
	return json.Unmarshal(b, dst) == nil
}

func (c *Cache) Set(ctx context.Context, key string, v any, ttl time.Duration) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	if err := c.rdb.Set(ctx, c.prefix+key, b, ttl).Err(); err != nil {
		slog.Warn("redis set lỗi", "key", key, "err", err)
	}
}

// Del xoá một hoặc nhiều khoá. Khoá kết thúc bằng "*" xoá theo mẫu.
func (c *Cache) Del(ctx context.Context, keys ...string) {
	for _, k := range keys {
		if len(k) > 0 && k[len(k)-1] == '*' {
			iter := c.rdb.Scan(ctx, 0, c.prefix+k, 200).Iterator()
			for iter.Next(ctx) {
				c.rdb.Del(ctx, iter.Val())
			}
			continue
		}
		if err := c.rdb.Del(ctx, c.prefix+k).Err(); err != nil {
			slog.Warn("redis del lỗi", "key", k, "err", err)
		}
	}
}

// GetOrLoad trả giá trị trong cache, nếu không có thì gọi load và lưu lại.
func GetOrLoad[T any](ctx context.Context, c *Cache, key string, ttl time.Duration, load func(context.Context) (T, error)) (T, error) {
	var v T
	if c.Get(ctx, key, &v) {
		return v, nil
	}
	v, err := load(ctx)
	if err != nil {
		return v, err
	}
	c.Set(ctx, key, v, ttl)
	return v, nil
}

// TryLock lấy khoá phân tán để chỉ một bản sao chạy một job tại một thời điểm.
// Redis lỗi thì trả false: bỏ qua lượt này, lượt sau thử lại.
func (c *Cache) TryLock(ctx context.Context, name string, ttl time.Duration) (unlock func(), ok bool) {
	key := c.prefix + "lock:" + name
	token := time.Now().Format(time.RFC3339Nano)
	got, err := c.rdb.SetNX(ctx, key, token, ttl).Result()
	if err != nil || !got {
		return func() {}, false
	}
	return func() {
		// Chỉ xoá nếu khoá vẫn là của mình.
		c.rdb.Eval(context.Background(),
			`if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
			[]string{key}, token)
	}, true
}
