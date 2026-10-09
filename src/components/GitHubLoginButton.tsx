import React from "react";
import { Button, App as AntdApp } from "antd";
import { FaGithub } from "react-icons/fa";
import LocalizedText from "@/components/LocalizedText";
import { useTranslation } from "@/hooks/useTranslation";
import { configuredOAuthUrl } from "@/lib/oauth-url.mjs";

interface GitHubLoginButtonProps {
  loading?: boolean;
  onLoading?: (loading: boolean) => void;
  className?: string;
}
const GitHubLoginButton: React.FC<GitHubLoginButtonProps> = ({
  loading = false,
  onLoading,
  className,
}) => {
  const { message } = AntdApp.useApp();
  const { translateText } = useTranslation();
  const providerReady = Boolean(configuredOAuthUrl(process.env.NEXT_PUBLIC_OAUTH));
  const handleGitHubSignIn = async () => {
    onLoading?.(true);
    try {
      const response = await fetch('/api/oauth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: '{}',
      });
      if (!response.ok) throw new Error("OAuth start unavailable");
      const { url } = await response.json();
      if (!configuredOAuthUrl(url)) throw new Error("Invalid OAuth navigation");
      window.location.assign(url);
    } catch {
      // Fail closed; provider/config details must not reach the user or logs.
      message.error(translateText("登录失败..."));
    } finally {
      onLoading?.(false);
    }
  };

  return (
    <Button
      type="default"
      icon={<FaGithub size={18} />}
      onClick={handleGitHubSignIn}
      disabled={!providerReady}
      loading={loading}
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        width: "100%",
        height: "40px",
        border: "1px solid #d9d9d9",
        borderRadius: "6px",
        fontSize: "14px",
        fontWeight: 500,
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#4078c0";
        e.currentTarget.style.color = "#4078c0";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#d9d9d9";
        e.currentTarget.style.color = "rgba(0, 0, 0, 0.88)";
      }}
    >
      <LocalizedText>{"使用 GitHub 登录"}</LocalizedText>
    </Button>
  );
};

export default React.memo(GitHubLoginButton);
