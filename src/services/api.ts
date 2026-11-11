import { getSession, signOut } from "next-auth/react";
import { message } from "antd";

export interface ApiResponse<T> {
  code: number;
  message: string;
  data?: T;
}

export const apiRequest = async <T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body: Record<string, unknown> | null = null,
): Promise<ApiResponse<T>> => {
  // 获取 API 域名（根据环境变量）
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    throw new Error("API URL is not defined");
  }

  const preview = process.env.NEXT_PUBLIC_SITE_PREVIEW_MODE === "true";
  if (preview && method !== "GET") {
    return { code: 403, message: "This preview is read-only." };
  }
  const session = preview ? null : await getSession();
  const token = session?.user?.token;

  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : null,
    signal: AbortSignal.timeout(20000),
  };

  try {
    const response = await fetch(`${apiUrl}${endpoint}`, options);
    // A permission denial is not an expired login. Keep the valid session.
    if (response.status === 401 || response.status === 403) {
      message.error(response.status === 401 ? "登录信息已过期，请重新登录" : "无权限访问");
      if (!preview && response.status === 401) await signOut({ redirect: true, callbackUrl: "/" });

      return {
        code: response.status,
        message:
          response.status === 401
            ? "登录信息已过期，请重新登录"
            : "无权限访问",
      };
    }

    const data = await response.json();

    return {
      code: data.code || 200,
      message: data.message,
      data: data.data,
    };
  } catch (error) {
    console.error("API 请求错误:", error);
    const errorMessage = error instanceof Error ? error.message : "服务器错误";
    message.error(errorMessage);
    return {
      code: 500,
      message: errorMessage,
    };
  }
};

export const StatisticsUrl =
  process.env.NEXT_PUBLIC_API_URL + "/statistics/stream";
