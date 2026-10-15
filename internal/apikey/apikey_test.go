package apikey

import (
	"regexp"
	"testing"
)

func TestGenerate(t *testing.T) {
	re := regexp.MustCompile(`^mk-live-[A-Za-z0-9]{32}$`)
	seen := map[string]bool{}
	for i := 0; i < 1000; i++ {
		k := Generate("live")
		if !re.MatchString(k.Secret) {
			t.Fatalf("sai định dạng: %q", k.Secret)
		}
		if k.Hash != Hash(k.Secret) || k.Last4 != k.Secret[len(k.Secret)-4:] {
			t.Fatalf("hash hoặc last4 sai: %+v", k)
		}
		if seen[k.Secret] {
			t.Fatal("trùng key")
		}
		seen[k.Secret] = true
	}
}

func TestHashKnownValue(t *testing.T) {
	// echo -n "abc" | sha256sum
	want := "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
	if got := Hash("abc"); got != want {
		t.Fatalf("got %s", got)
	}
}
