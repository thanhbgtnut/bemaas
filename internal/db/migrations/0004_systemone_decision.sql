-- SystemOne là decision API (POST /v1/systemone, model trong body): thao tác "decide" thay cho "invoke" tạm.
UPDATE model SET endpoint = '/v1', modes = '{decide}' WHERE standard = 'systemone';
