// Package migrations nhúng các tệp migration SQL để binary mang theo schema của mình.
// Tệp nằm ở migrations/postgres và được chạy theo thứ tự tên.
package migrations

import "embed"

// Postgres chứa migrations/postgres/*.sql.
//
//go:embed postgres/*.sql
var Postgres embed.FS
