export class CreateUserDto {
  name!: string;
  role?: string;
  roles?: string[];
  login!: string;
  pin!: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  extra?: string;
  avatarDataUrl?: string;
  isActive?: boolean;
}
