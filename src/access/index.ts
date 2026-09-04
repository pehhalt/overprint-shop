import type { Access } from 'payload'

/** Public read. Anyone, authenticated or not, may read. */
export const anyone: Access = () => true

/** Only a logged-in admin may write. */
export const isLoggedIn: Access = ({ req: { user } }) => Boolean(user)
