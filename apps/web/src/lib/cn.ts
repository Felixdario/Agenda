import { type ClassValue, clsx } from 'clsx';

export function cn(...classes: ClassValue[]): string {
  return clsx(classes);
}
