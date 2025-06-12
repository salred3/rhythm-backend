import { Module } from '@nestjs/common';
import { CompanyPreferencesService } from './company-preferences.service';

@Module({
  providers: [CompanyPreferencesService],
  exports: [CompanyPreferencesService],
})
export class SettingsModule {}
