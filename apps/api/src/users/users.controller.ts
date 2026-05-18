import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

function ok(data: unknown) {
  return { statusCode: 200, data, error: null };
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('login-options')
  async loginOptions() {
    const data = await this.users.listLoginUsers();
    return ok(data);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OFICINA')
  async list(@Query('includeInactive') includeInactive?: string, @Query('role') role?: string) {
    const data = await this.users.list({
      includeInactive: includeInactive === 'true',
      role,
    });
    return ok(data);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async create(@Body() dto: CreateUserDto) {
    const data = await this.users.create(dto);
    return ok(data);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const data = await this.users.update(id, dto);
    return ok(data);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async remove(@Param('id') id: string) {
    const data = await this.users.deactivate(id);
    return ok(data);
  }
}
