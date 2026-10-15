// Đăng nhập OIDC với Keycloak theo luồng Authorization Code + PKCE (oidc-client-ts).
// Issuer và client_id lấy từ GET /api/v1/config, nên một bản build dùng được cho mọi môi trường.
import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts'

let manager: UserManager | null = null
let currentUser: User | null = null

export type PublicConfig = {
  oidc: { issuer: string; client_id: string }
  gateway_base_url: string
}

export let publicConfig: PublicConfig

export async function initAuth(): Promise<User> {
  const res = await fetch('/api/v1/config')
  if (!res.ok) throw new Error('Không đọc được cấu hình từ máy chủ')
  publicConfig = await res.json()

  manager = new UserManager({
    authority: publicConfig.oidc.issuer,
    client_id: publicConfig.oidc.client_id,
    redirect_uri: window.location.origin + '/auth/callback',
    post_logout_redirect_uri: window.location.origin + '/',
    response_type: 'code',
    scope: 'openid profile email',
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  })
  manager.events.addUserLoaded((u) => { currentUser = u })

  if (window.location.pathname === '/auth/callback') {
    const user = await manager.signinRedirectCallback()
    const back = (user.state as string | undefined) || '/'
    window.history.replaceState({}, '', back)
    currentUser = user
    return user
  }

  const user = await manager.getUser()
  if (user && !user.expired) {
    currentUser = user
    return user
  }
  await manager.signinRedirect({ state: window.location.pathname + window.location.search })
  return new Promise(() => {}) // trình duyệt đang chuyển sang Keycloak
}

export function accessToken(): string | undefined {
  return currentUser?.access_token
}

export async function logout() {
  await manager?.signoutRedirect()
}

export async function relogin() {
  await manager?.signinRedirect({ state: window.location.pathname + window.location.search })
}
