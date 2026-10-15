// Package httpx gom cách trả lỗi và đọc tham số dùng chung cho các handler Hertz.
package httpx

import (
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Error là lỗi nghiệp vụ có mã để giao diện hiển thị đúng thông báo (mục 12).
type Error struct {
	Status  int            `json:"-"`
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

func E(status int, code, msg string) *Error { return &Error{Status: status, Code: code, Message: msg} }

func (e *Error) With(k string, v any) *Error {
	if e.Details == nil {
		e.Details = map[string]any{}
	}
	e.Details[k] = v
	return e
}

var (
	ErrUnauthorized = E(http.StatusUnauthorized, "UNAUTHORIZED", "Cần đăng nhập")
	ErrForbidden    = E(http.StatusForbidden, "FORBIDDEN", "Bạn không có quyền thực hiện thao tác này")
	ErrNotFound     = E(http.StatusNotFound, "NOT_FOUND", "Không tìm thấy")
)

func BadRequest(msg string) *Error { return E(http.StatusBadRequest, "BAD_REQUEST", msg) }
func Conflict(code, msg string) *Error {
	return E(http.StatusConflict, code, msg)
}
func Unprocessable(code, msg string) *Error {
	return E(http.StatusUnprocessableEntity, code, msg)
}

// Fail ghi lỗi ra response. Lỗi không phải *Error được che thành 500 và ghi log.
func Fail(c *app.RequestContext, err error) {
	var ae *Error
	switch {
	case errors.As(err, &ae):
	case errors.Is(err, pgx.ErrNoRows):
		ae = ErrNotFound
	default:
		var pe *pgconn.PgError
		if errors.As(err, &pe) && pe.Code == "23505" {
			ae = Conflict("DUPLICATE", "Dữ liệu bị trùng: "+pe.ConstraintName)
			break
		}
		slog.Error("lỗi xử lý request", "path", string(c.Path()), "err", err)
		ae = E(http.StatusInternalServerError, "INTERNAL", "Lỗi hệ thống, vui lòng thử lại")
	}
	c.AbortWithStatusJSON(ae.Status, ae)
}

func OK(c *app.RequestContext, v any)      { c.JSON(http.StatusOK, v) }
func Created(c *app.RequestContext, v any) { c.JSON(http.StatusCreated, v) }
func NoContent(c *app.RequestContext)      { c.Status(http.StatusNoContent) }

// Bind đọc JSON body vào dst.
func Bind(c *app.RequestContext, dst any) error {
	dec := json.NewDecoder(bytes.NewReader(c.Request.Body()))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return BadRequest("Dữ liệu gửi lên không hợp lệ: " + err.Error())
	}
	return nil
}
