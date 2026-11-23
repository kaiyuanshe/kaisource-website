# 开源社官网 · KaiSource Website

开源社（KaiSource / KaiYuanShe）官网，提供社区介绍、文章与公告、活动、年度报告、合作伙伴及社区治理等内容。

The official KaiSource website. One multilingual codebase serves both the Chinese and international sites, with shared articles, events, users, and permissions.

| 站点 | 地址 | 默认语言 |
| --- | --- | --- |
| 中文官网 | [kaiyuanshe.cn](https://kaiyuanshe.cn) | 简体中文 |
| 国际官网 | [www.kaisource.org](https://www.kaisource.org) | English |

两个站点均可切换语言。切换语言时保留当前域名和页面，不会因选择英文而将国内访客跳转到海外站。

## 项目概览

- **内容与社区**：博客、公告、活动列表与日历、年度报告、城市社区、成员及合作伙伴。
- **多语言**：支持简体中文、繁体中文和英文；页面界面翻译与文章、活动的内容翻译分别维护。
- **账号与管理**：共用用户和权限体系，支持登录、内容编辑、审核及图片管理；写入操作由后端校验权限。
- **统一部署**：中文站与国际站使用同一套代码，通过环境变量选择默认语言和部署配置。

本仓库承接 [kaiyuanshe/website](https://github.com/kaiyuanshe/website) 的官网代码与 Git 历史，是当前国内、海外官网的统一开发仓库。旧仓库的历史已连接到本仓库，后续贡献请提交到这里的 `main` 分支。

## 技术栈与目录

| 层 | 实现 |
| --- | --- |
| 前端 | Next.js 16（Pages Router）、React、TypeScript、Ant Design |
| 后端 | Go、Gin、GORM |
| 数据与登录 | PostgreSQL、NextAuth 与共享 Go API |
| 图片 | 仓库静态资源与 Cloudinary |
| 发布 | GitHub Actions → 阿里云 / Vercel |

```text
src/
  pages/          页面与 Next.js HTTP 接口
  components/     公共组件与首页模块
  services/       前端请求及后端接口封装
  contexts/       共享认证等上下文
  lib/            语言、代理、内容安全等公共逻辑
  data/           成员、合作伙伴、发展历程等静态数据
locales/          界面翻译词条
public/           图片、llms.txt、站点指南及其他静态资源
kaiyuanshe/       Go API、数据库模型及后端测试
tests/            前端、权限、安全与发布回归测试
scripts/          内容、验证与发布工具
deploy/           部署配置及适配脚本
.github/          CI/CD 与 CODEOWNERS
docs/             架构、配置、运维和历史验收记录
```

## 快速开始：本地页面预览

仅修改页面、样式、静态内容或翻译时，可以使用内置的公开内容快照，无需配置数据库和生产凭据。

需要 Node.js（版本见 [`.nvmrc`](.nvmrc)）和 npm。使用 nvm 的开发者可按以下步骤启动：

```sh
git clone https://github.com/kaiyuanshe/kaisource-website.git
cd kaisource-website
nvm install
nvm use
npm ci --legacy-peer-deps --no-audit --no-fund
SITE_PREVIEW_MODE=true SITE_DEFAULT_LOCALE=zh-CN npm run dev
```

打开 `http://localhost:3000`。预览使用仓库中的内容快照，登录、编辑和上传不可用；快照内容不代表正式站的实时数据。以英文预览时，将 `SITE_DEFAULT_LOCALE` 改为 `en`。以上环境变量写法适用于 macOS / Linux；Windows 可在 `.env.local` 中设置后运行 `npm run dev`。

预览生产构建时，构建与启动必须使用一致的设置：

```sh
SITE_PREVIEW_MODE=true SITE_DEFAULT_LOCALE=zh-CN npm run build
SITE_PREVIEW_MODE=true SITE_DEFAULT_LOCALE=zh-CN npm start
```

更多说明见[快照预览](docs/preview-deployment.md)。

## 完整开发与后端联调

需要登录、审核或上传功能时，使用独立的开发数据库和测试服务，并关闭快照预览。

### 前端配置

```sh
cp .env.example .env.local
```

根据开发环境修改 `.env.local`，不要直接沿用示例中的正式站 API 地址：

| 配置 | 用途 |
| --- | --- |
| `SITE_PREVIEW_MODE=false` | 使用真实 API，而非内容快照 |
| `SITE_DEFAULT_LOCALE` | 构建时选择默认语言：`zh-CN`、`zh-TW` 或 `en` |
| `NEXT_PUBLIC_API_URL=/v1` | 浏览器使用当前站点的 API 路径 |
| `API_PROXY_ORIGIN` | Go API 的受信任 HTTPS 源地址，Next.js 代理 `/v1/*` 请求 |
| `INTERNAL_API_URL` | 服务端登录请求的 API 地址；省略时由代理源地址派生 |
| `NEXTAUTH_URL`、`NEXTAUTH_SECRET` | 当前前端访问地址和独立的开发会话密钥 |
| `NEXT_PUBLIC_OAUTH`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` | 启用 GitHub 登录时配置，回调地址需与测试应用一致 |
| `CLOUDINARY_*`、`NEXT_PUBLIC_CLOUDINARY_*` | 启用图片管理时配置，详见[媒体安全](docs/media-security.md) |

Next.js 的 API 代理要求 HTTPS 上游；不要直接将 `API_PROXY_ORIGIN` 设为本地 HTTP 地址。前后端本地联调时，需要为 Go API 配置受信任的 HTTPS 入口，或由本地反向代理将同源 `/v1` 请求转发到 Go 服务。

配置完成后运行 `npm run dev`。`NEXT_PUBLIC_*` 会进入浏览器代码，只能放公开配置；数据库密码、Cloudinary secret 和其他密钥应保留在服务端配置中。

### Go 后端

Go 版本以 [`kaiyuanshe/go.mod`](kaiyuanshe/go.mod) 为准。准备独立的 PostgreSQL 开发数据库，复制并填写后端配置：

```sh
cp kaiyuanshe/config.example.yaml kaiyuanshe/config.yaml
cd kaiyuanshe
go mod download
```

在 `config.yaml` 中设置开发数据库、`jwt.secret` 和所需的可选服务。也可通过 `DATABASE_URL`、`JWT_SECRET` 等环境变量覆盖 YAML 配置。

仅在首次初始化空的开发数据库时执行：

```sh
go run . -mode migrate
go run . -mode migrate-auth
go run . -mode seed
```

启动 API：

```sh
go run . -mode serve
```

默认端口为 `8080`，`/healthz` 检查数据库连通性。启动服务不会自动执行迁移、初始化数据或开启定时任务。迁移与 seed 只针对已确认的开发数据库，完整配置和操作说明见[后端运行指南](docs/backend-runtime.md)。

## 多语言与内容维护

`SITE_DEFAULT_LOCALE` 在构建时决定默认语言。未显式设置时，Vercel 和快照预览默认英文，普通独立部署默认简体中文。默认语言不带 URL 前缀，其他语言使用前缀，例如：

| 部署默认语言 | 中文关于页 | 英文关于页 |
| --- | --- | --- |
| 简体中文 | `/about` | `/en/about` |
| English | `/zh-CN/about` | `/about` |

切换语言保留当前域名、页面路径、内容 ID 和查询参数。界面翻译主要位于 `locales/`，由 `useTranslation` 和 `LocalizedText` 使用；文章与活动的翻译通过内容的 `locale`、`translation_of` 关联，缺少译文时显示回退提示。

修改页面时同步维护对应界面词条；维护成员、合作伙伴等静态内容时，参考[数据更新方式](src/data/数据更新方式.md)。图片引用需与 `public/` 内实际文件一致。

站点还提供 [`/llms.txt`](public/llms.txt) 和纯 Markdown [站点指南](public/site-guide.md)。公共路由、品牌名称或域名变化时，需同步更新这两份文件。

## 测试与构建

在仓库根目录运行：

```sh
node --test tests/*.test.mjs
npm run typecheck
npm run lint
npm run build
```

Go 测试与构建：

```sh
cd kaiyuanshe
go test ./...
go build ./...
```

按改动范围执行专项检查：

| 命令 | 检查内容 |
| --- | --- |
| `npm run test:preview` | 公开快照、分页与预览隔离 |
| `npm run test:locales` | 默认语言、路由与同域切换 |
| `npm run test:article-permissions` | 文章操作与后端权限的一致性 |
| `npm run test:media-security` | 图片管理的认证和授权 |
| `npm run test:llms` | AI 可读索引与站点指南 |
| `npm run test:backend-runtime` | 隔离的后端运行验证，需要本地 PostgreSQL 工具 |
| `npm run test:auth-runtime` | 构建后验证 NextAuth、Go 和临时 PostgreSQL 的集成 |
| `npm run test:overseas-deployment` | 海外部署配置的静态检查 |
| `KAISOURCE_SMOKE_SITE=https://www.kaisource.org npm run test:overseas-site` | 已部署海外站点的运行检查 |
| `npm run check:overseas-release` | 海外发布预检，需要项目范围的 `VERCEL_TOKEN` |

后端运行测试使用临时数据库，不需要生产数据库凭据。静态检查和构建通过不等于线上功能已验收。

## 生产部署

| 环境 | 前后端运行位置 | 数据源 |
| --- | --- | --- |
| 国内 | 阿里云服务器 | 共享 Neon PostgreSQL |
| 海外 | Vercel 前端与 Go API | 同一个共享 Neon PostgreSQL |

国内与海外共用文章、活动、用户、权限及认证状态。原 Azure 数据库保留作恢复快照，不作为另一份可编辑的生产数据源。

发布入口为 [`.github/workflows/release.yml`](.github/workflows/release.yml)：PR 只做检查；审核合并到 `main` 后，再次验证合并提交并自动部署两端。生产发布使用 GitHub `production` 环境中的配置与凭据，不另行开启 Vercel 原生 Git 生产发布。

前端 `/api/health` 返回运行版本，后端 `/healthz` 检查数据库。详细的部署配置、凭据设置、版本校验与回滚步骤见[自动部署指南](docs/automatic-deployment.md)和[国内部署指南](deploy/domestic/README.md)。`deploy.sh` 是旧服务器部署脚本，不用于当前发布流程。

## 参与贡献

1. Fork 或创建开发分支，从最新 `main` 开始修改。
2. 按改动运行相关测试，检查类型与构建；页面和语言改动同时验证中英文与移动端。
3. 使用 DCO 签署提交：`git commit --signoff`。
4. 向本仓库 `main` 提交 PR，说明改动、影响和验证结果。
5. 通过 `Test and build`、DCO 及 CODEOWNERS 审查后合并，后续部署由 CI 完成。

保留贡献者真实署名。需要连接旧仓库历史的 PR 使用 merge commit，避免 squash 或 rebase 丢失预期的历史关联。问题反馈请提交到本仓库的 [Issues](https://github.com/kaiyuanshe/kaisource-website/issues)。

## 文档索引

- [自动部署、审核与发布门槛](docs/automatic-deployment.md)
- [后端配置、迁移与运行检查](docs/backend-runtime.md)
- [共享认证状态](docs/shared-auth-state.md)
- [图片管理与媒体安全](docs/media-security.md)
- [静态内容与合作伙伴数据维护](src/data/数据更新方式.md)
- [快照预览](docs/preview-deployment.md)
- [部署架构与迁移背景](docs/deployment-architecture.md)

`docs/acceptance-*`、`docs/release-*` 等按日期命名的文件是历史记录；当前操作以自动部署及运行指南为准。

## 许可证

代码遵循 [Apache License 2.0](LICENSE)。
