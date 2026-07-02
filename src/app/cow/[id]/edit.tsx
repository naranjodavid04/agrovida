import { useLocalSearchParams } from 'expo-router';

import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { getDatabase } from '@/db/database';
import { CowForm } from '@/features/herd/CowForm';
import { strings } from '@/lib/i18n/strings';
import { getCow } from '@/repositories/cows';

/** Screen 9 (edit variant). */
export default function EditCowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cow = getCow(getDatabase(), id);

  if (!cow) {
    return (
      <ScreenContainer>
        <ScreenHeader title={strings.herd.editCow} />
      </ScreenContainer>
    );
  }
  return <CowForm existing={cow} />;
}
