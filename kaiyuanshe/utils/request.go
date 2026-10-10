package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type HTTPRequestParams struct {
	URL     string
	Method  string
	Headers map[string]string
	Body    interface{}
}

func SendHTTPRequest(params HTTPRequestParams) (string, error) {
	return sendHTTPRequest(params, &http.Client{Timeout: 15 * time.Second})
}

func sendHTTPRequest(params HTTPRequestParams, client *http.Client) (string, error) {
	var reqBody []byte
	var err error
	if params.Body != nil {
		reqBody, err = json.Marshal(params.Body)
		if err != nil {
			return "", err
		}
	}

	// 创建请求
	req, err := http.NewRequest(params.Method, params.URL, bytes.NewBuffer(reqBody))
	if err != nil {
		return "", err
	}

	// 添加头部信息
	for key, value := range params.Headers {
		req.Header.Set(key, value)
	}

	// 设置内容类型为JSON（常用）
	if req.Body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	// 发送请求
	resp, err := client.Do(req)
	if err != nil {
		// OAuth URLs and provider bodies can contain codes or account data.
		return "", fmt.Errorf("provider request failed")
	}
	defer resp.Body.Close()

	// 读取响应
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("provider returned HTTP %d", resp.StatusCode)
	}
	const maxResponse = 2 * 1024 * 1024
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponse+1))
	if err != nil {
		return "", err
	}
	if len(body) > maxResponse {
		return "", fmt.Errorf("provider response too large")
	}

	return string(body), nil
}
