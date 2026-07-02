import { strings } from '@/lib/i18n/strings';
import { DomainError } from '@/lib/validation';

/** Maps DomainError codes to es-CO copy (strings stay centralized, D-004). */
export function domainErrorMessage(error: unknown): string {
  if (!(error instanceof DomainError)) {
    return error instanceof Error ? error.message : String(error);
  }
  switch (error.code) {
    case 'duplicate_tag':
      return strings.herd.duplicateTag;
    case 'own_mother':
      return strings.herd.ownMotherError;
    case 'mother_not_found':
    case 'mother_other_farm':
      return strings.herd.ownMotherError;
    case 'invalid_liters':
      return strings.milk.invalidLiters;
    case 'liters_too_high':
      return strings.milk.litersTooHigh;
    case 'future_birth_date':
    case 'invalid_date':
      return strings.herd.invalidBirthDate;
    case 'name_required':
      return strings.herd.nameRequired;
    default:
      return error.message;
  }
}
