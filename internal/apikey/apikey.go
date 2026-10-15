// Package apikey sinh và băm API key theo mục 12: `mk-<live|test>-<32 ký tự ngẫu nhiên an toàn>`,
// băm SHA-256 trên đúng chuỗi key. Bí mật chỉ trả về một lần, không bao giờ lưu.
package apikey

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
)

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

type Key struct {
	Secret string // trả cho người dùng một lần
	Hash   string // "sha256:<hex>", dạng agentgateway đọc
	Last4  string
}

func Generate(env string) Key {
	// rand.Text không cho chọn bảng chữ; tự lấy mẫu từ 62 ký tự, bỏ byte lệch để phân bố đều.
	buf := make([]byte, 0, 32)
	b := make([]byte, 64)
	for len(buf) < 32 {
		rand.Read(b)
		for _, x := range b {
			if x < 248 && len(buf) < 32 { // 248 = 62*4
				buf = append(buf, alphabet[x%62])
			}
		}
	}
	secret := "mk-" + env + "-" + string(buf)
	return Key{Secret: secret, Hash: Hash(secret), Last4: secret[len(secret)-4:]}
}

func Hash(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return "sha256:" + hex.EncodeToString(sum[:])
}
