package utils

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestProviderRequestBoundedAndRedacted(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer server.Close()
	start := time.Now()
	_, err := sendHTTPRequest(HTTPRequestParams{URL: server.URL + "?code=private", Method: "GET"}, &http.Client{Timeout: 50 * time.Millisecond})
	if err == nil || strings.Contains(err.Error(), "private") || time.Since(start) > time.Second {
		t.Fatal("unbounded or unsafe provider request")
	}
}

func TestProviderRequestRejectsStatusAndOversize(t *testing.T) {
	for _, status := range []int{http.StatusUnauthorized, http.StatusOK} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(status)
			if status == http.StatusOK {
				w.Write([]byte(strings.Repeat("a", 2*1024*1024+1)))
			} else {
				w.Write([]byte("private-provider-error"))
			}
		}))
		_, err := SendHTTPRequest(HTTPRequestParams{URL: server.URL, Method: "GET"})
		server.Close()
		if err == nil || strings.Contains(err.Error(), "private-provider-error") {
			t.Fatal("provider failure accepted or leaked")
		}
	}
}
