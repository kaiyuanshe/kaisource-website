import React from "react";
import { Button } from "antd";
import { FaGithub } from "react-icons/fa";
import { useRouter } from "next/router";
import LocalizedText from "@/components/LocalizedText";
import { configuredOAuthUrl, oauthLoginUrl } from "@/lib/oauth-url.mjs";

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
  const router = useRouter();

  const providerReady = Boolean(configuredOAuthUrl(process.env.NEXT_PUBLIC_OAUTH));
  const handleGitHubSignIn = () => {
    const oauthUrl = oauthLoginUrl(process.env.NEXT_PUBLIC_OAUTH, window.location.origin, window.location.pathname);
    if (!oauthUrl) return;
    onLoading?.(true);
    router.push(oauthUrl);
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
