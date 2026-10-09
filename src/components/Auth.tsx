import React, { useState } from "react";
import { Dropdown, Button } from "antd";
import type { MenuProps } from "antd";
import { useRouter } from "next/router";
import { signOut } from "next-auth/react";
import styles from "../styles/Auth.module.css";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import GitHubLoginButton from "@/components/GitHubLoginButton";
import LocalizedText from "@/components/LocalizedText";
import { useTranslation } from "@/hooks/useTranslation";

const Auth: React.FC = () => {
  const { translateText } = useTranslation();
  // 使用简化的认证上下文，利用 NextAuth 内置缓存机制
  const { session } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // Only the canonical login page consumes OAuth callbacks. The global header
  // must not race it or interpret unrelated content-page query parameters.

  const handleSignIn = () => {
    // Email login is local to this deployment; it is not an OAuth redirect.
    router.push("/login");
  };

  const handleLogout = async () => {
    // 执行登出操作，NextAuth 会自动清除会话状态
    await signOut({ redirect: true, callbackUrl: "/" });
  };

  const onClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "logout") handleLogout();
    if (key === "profile") router.push("/dashboard");
  };

  const items: MenuProps["items"] = [
    {
      key: "name",
      label: <span>{session?.user?.username}</span>,
      disabled: true,
    },
    {
      key: "profile",
      label: translateText("个人页面"),
    },
    {
      key: "logout",
      label: translateText("退出登录"),
    },
  ];

  return (
    <div className={styles.auth}>
      {session?.user ? (
        <>
          <Dropdown menu={{ items, onClick }} trigger={["hover"]}>
            <div className={styles.userInfo}>
              <Image
                src={session.user.avatar as string}
                alt="avatar"
                width={40}
                height={40}
                className={styles.avatarImage}
              />
            </div>
          </Dropdown>
        </>
      ) : (
        <Dropdown
          menu={{
            items: [
              {
                key: "email",
                label: (
                  <Button
                    type="text"
                    style={{ width: "100%", textAlign: "left" }}
                    onClick={handleSignIn}
                    loading={loading}
                  >
                    <LocalizedText>{"邮箱登录"}</LocalizedText>
                  </Button>
                ),
              },
              {
                key: "github",
                label: (
                  <GitHubLoginButton
                    loading={loading}
                    onLoading={setLoading}
                    className={styles.githubBtn}
                  />
                ),
              },
            ],
          }}
          trigger={["click"]}
        >
          <Button type="primary" className={styles.navButton} loading={loading}>
            <LocalizedText>{"登录 ▼"}</LocalizedText>
          </Button>
        </Dropdown>
      )}
    </div>
  );
};

// 使用 React.memo 防止不必要的重新渲染
export default React.memo(Auth);
