export const Permissions = {
  Anyone: 'Anyone',
  SiteMember: 'SiteMember',
  Admin: 'Admin',
};

export function webMethod(_permissions, handler) {
  return (...args) => handler(...args);
}
