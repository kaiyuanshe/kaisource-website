package utils

import (
	"bytes"
	"encoding/base64"
	"image/png"
	"strings"
	"testing"
)

func TestCaptchaUsesRandomRasterWithoutPlaintextAnswer(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 20; i++ {
		answer, data, err := GenerateCaptchaImage()
		if err != nil {
			t.Fatal(err)
		}
		if len(answer) != 6 || seen[answer] {
			t.Fatal("invalid or reused challenge text")
		}
		seen[answer] = true
		for _, char := range answer {
			if !strings.ContainsRune("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", char) {
				t.Fatal("unexpected symbol")
			}
		}
		if !strings.HasPrefix(data, "data:image/png;base64,") {
			t.Fatal("captcha is not a PNG")
		}
		encoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(data, "data:image/png;base64,"))
		if err != nil {
			t.Fatal(err)
		}
		image, err := png.Decode(bytes.NewReader(encoded))
		if err != nil || image.Bounds().Dx() != 180 || image.Bounds().Dy() != 56 {
			t.Fatal("invalid captcha image")
		}
		if bytes.Contains(encoded, []byte(answer)) || bytes.Contains(encoded, []byte("<text")) {
			t.Fatal("answer text embedded in image")
		}
	}
}
