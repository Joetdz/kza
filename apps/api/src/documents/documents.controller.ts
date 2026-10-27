import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.guard';
import { DocumentsService } from './documents.service';
import { CreateSaleFromDocumentDto, SaveDocumentDto, SendDocumentDto } from './dto/document.dto';

// Quotes and invoices carry prices and totals — same access as sales.
@Controller('documents')
@Roles('owner', 'manager')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  private biz(user: AuthUser) {
    return user.businessId || null;
  }

  @Get()
  list(@Query('type') type: string | undefined, @CurrentUser() user: AuthUser) {
    return this.documents.list(user.ownerId, this.biz(user), type);
  }

  @Post()
  create(@Body() dto: SaveDocumentDto, @CurrentUser() user: AuthUser) {
    return this.documents.create(user.ownerId, this.biz(user), dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<SaveDocumentDto>, @CurrentUser() user: AuthUser) {
    return this.documents.update(id, user.ownerId, this.biz(user), dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documents.remove(id, user.ownerId, this.biz(user));
  }

  @Post(':id/to-invoice')
  toInvoice(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.documents.quoteToInvoice(id, user.ownerId, this.biz(user));
  }

  @Post(':id/sale')
  createSale(@Param('id') id: string, @Body() dto: CreateSaleFromDocumentDto, @CurrentUser() user: AuthUser) {
    return this.documents.createSale(id, user.ownerId, this.biz(user), dto.status);
  }

  @Post(':id/send')
  send(@Param('id') id: string, @Body() dto: SendDocumentDto, @CurrentUser() user: AuthUser) {
    return this.documents.send(id, user.ownerId, this.biz(user), dto.pdfBase64, dto.phone);
  }
}
