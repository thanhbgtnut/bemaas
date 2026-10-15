// Package storage lưu tệp lên kho tương thích S3 (MinIO, Ceph, S3 nội bộ).
package storage

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"bemaas/internal/config"
)

type Store struct {
	client *minio.Client
	bucket string
	expiry time.Duration
}

func New(cfg config.S3) (*Store, error) {
	lookup := minio.BucketLookupAuto
	if cfg.PathStyle {
		lookup = minio.BucketLookupPath
	}
	client, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:        credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure:       cfg.UseSSL,
		Region:       cfg.Region,
		BucketLookup: lookup,
	})
	if err != nil {
		return nil, fmt.Errorf("khởi tạo S3: %w", err)
	}
	return &Store{client: client, bucket: cfg.Bucket, expiry: cfg.URLExpiry}, nil
}

// EnsureBucket tạo bucket nếu chưa có (tiện cho môi trường local; trên môi trường thật bucket tạo sẵn).
func (s *Store) EnsureBucket(ctx context.Context) error {
	ok, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		return fmt.Errorf("kiểm tra bucket %s: %w", s.bucket, err)
	}
	if ok {
		return nil
	}
	return s.client.MakeBucket(ctx, s.bucket, minio.MakeBucketOptions{})
}

func (s *Store) Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, r, size, minio.PutObjectOptions{ContentType: contentType})
	return err
}

func (s *Store) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	return s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
}

// PresignGet trả URL tải xuống có thời hạn ngắn; bucket vẫn để riêng tư.
func (s *Store) PresignGet(ctx context.Context, key, filename string) (string, error) {
	params := url.Values{}
	params.Set("response-content-disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	u, err := s.client.PresignedGetObject(ctx, s.bucket, key, s.expiry, params)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}
