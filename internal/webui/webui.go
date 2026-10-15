// Package webui nhúng bản build của giao diện React (frontend/, `make ui`) vào binary Go,
// để một binary phục vụ cả API lẫn giao diện. Vite build thẳng vào internal/webui/dist.
package webui

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
