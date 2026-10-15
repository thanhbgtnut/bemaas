// Package web nhúng bản build tĩnh của giao diện React (web/dist) vào binary Go.
// Chạy `make web` (npm run build) trước `go build` để có bản giao diện mới nhất.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// Dist trả hệ thống tệp gốc là thư mục dist.
func Dist() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err)
	}
	return sub
}
