package auth

import "testing"

func TestForClient(t *testing.T) {
	cases := []struct {
		name string
		aud  []string
		azp  string
		want bool
	}{
		{"aud có audience (Audience mapper)", []string{"bemaas-web"}, "bemaas-web", true},
		{"không có mapper, azp đúng client", []string{"account"}, "bemaas-web", true},
		{"không có aud, azp đúng client", nil, "bemaas-web", true},
		{"token của client khác", []string{"account"}, "other-app", false},
	}
	for _, c := range cases {
		if got := forClient(c.aud, c.azp, "bemaas-web", "bemaas-web"); got != c.want {
			t.Errorf("%s: forClient = %v, muốn %v", c.name, got, c.want)
		}
	}
}
