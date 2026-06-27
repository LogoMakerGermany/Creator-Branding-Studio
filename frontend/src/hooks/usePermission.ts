import { Permission, ROLE_PERMISSIONS, UserRole } from '@ucbs/shared';
import { useAuth } from '@/context/AuthContext';

export function usePermission(permission: Permission): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role as UserRole]?.includes(permission) ?? false;
}

export function usePermissions(...permissions: Permission[]): boolean {
  return permissions.every((p) => usePermission(p));
}
