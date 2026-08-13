export const userPermissions = ["user", "developer", "superadmin"] as const;

export type UserPermission = (typeof userPermissions)[number];

export function canManageUsers(permission: UserPermission): boolean {
  return permission === "developer" || permission === "superadmin";
}

export function canManageAdministrators(permission: UserPermission): boolean {
  return permission === "superadmin";
}
