import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppButton } from '@/components/AppButton';
import { CowPhoto } from '@/components/CowPhoto';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextField } from '@/components/TextField';
import { getDatabase } from '@/db/database';
import { useAuth } from '@/features/auth/AuthProvider';
import { isValidIsoDate, toIsoDate } from '@/lib/dates';
import { strings } from '@/lib/i18n/strings';
import { listCows } from '@/repositories/cows';
import { colors, fonts, radius, spacing, touchTarget } from '@/lib/theme/tokens';
import type { Cow, LactationStatus, PregnancyStatus } from '@/types/domain';

import { domainErrorMessage } from './errorMessages';
import { pickCowPhoto } from './photoPicker';
import { formatAge } from './queries';
import { saveCowEdits, saveNewCow } from './service';

/**
 * Screen 9 — add/edit cow (DESIGN_SPEC §7): photo, name, tag, birth date +
 * estimated flag, breed, mother selector, calving count, lactation and
 * pregnancy statuses. No numeric age, no combined status, no milk field —
 * milking is a separate action offered after saving.
 */

interface Props {
  existing?: Cow;
}

export function CowForm({ existing }: Props) {
  const router = useRouter();
  const { activeFarmId, user } = useAuth();

  const [name, setName] = useState(existing?.name ?? '');
  const [tag, setTag] = useState(existing?.tagNumber ?? '');
  const [breed, setBreed] = useState(existing?.breed ?? '');
  const [birthDate, setBirthDate] = useState<string | null>(existing?.birthDate ?? null);
  const [estimated, setEstimated] = useState(existing?.birthDateIsEstimated ?? false);
  const [motherId, setMotherId] = useState<string | null>(existing?.motherId ?? null);
  const [calvingCount, setCalvingCount] = useState(String(existing?.calvingCount ?? 0));
  const [lactation, setLactation] = useState<LactationStatus>(
    existing?.lactationStatus ?? 'unknown',
  );
  const [pregnancy, setPregnancy] = useState<PregnancyStatus>(
    existing?.pregnancyStatus ?? 'unknown',
  );
  const [newPhotoUri, setNewPhotoUri] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMotherPicker, setShowMotherPicker] = useState(false);
  const [motherSearch, setMotherSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const driver = getDatabase();
  const motherOptions = activeFarmId
    ? listCows(driver, activeFarmId, motherSearch).filter((cow) => cow.id !== existing?.id)
    : [];
  const mother = motherId ? motherOptions.find((c) => c.id === motherId) : null;
  const motherName =
    mother?.name ??
    (motherId && activeFarmId
      ? (listCows(driver, activeFarmId).find((c) => c.id === motherId)?.name ?? '')
      : '');

  const choosePhoto = () => {
    Alert.alert(strings.herd.changePhoto, undefined, [
      {
        text: strings.herd.takePhoto,
        onPress: () => void pickAndSet('camera'),
      },
      {
        text: strings.herd.pickPhoto,
        onPress: () => void pickAndSet('library'),
      },
      { text: strings.common.cancel, style: 'cancel' },
    ]);
  };

  const pickAndSet = async (source: 'camera' | 'library') => {
    try {
      const uri = await pickCowPhoto(source);
      if (uri) setNewPhotoUri(uri);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const save = () => {
    if (!activeFarmId || !user) return;
    setError(null);
    const calving = Number.parseInt(calvingCount || '0', 10);
    try {
      if (existing) {
        saveCowEdits(
          driver,
          existing.id,
          {
            name,
            tagNumber: tag.trim() === '' ? null : tag,
            breed: breed.trim() === '' ? null : breed.trim(),
            birthDate,
            birthDateIsEstimated: estimated,
            motherId,
            calvingCount: Number.isNaN(calving) ? 0 : calving,
            lactationStatus: lactation,
            pregnancyStatus: pregnancy,
          },
          newPhotoUri,
        );
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
        return;
      }
      const cow = saveNewCow(
        driver,
        {
          farmId: activeFarmId,
          name,
          tagNumber: tag.trim() === '' ? null : tag,
          breed: breed.trim() === '' ? null : breed.trim(),
          birthDate,
          birthDateIsEstimated: estimated,
          motherId,
          calvingCount: Number.isNaN(calving) ? 0 : calving,
          lactationStatus: lactation,
          pregnancyStatus: pregnancy,
        },
        user.id,
        newPhotoUri,
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Immediate local confirmation + the separate milking action (§7).
      Alert.alert(strings.herd.savedCow, cow.name, [
        {
          text: strings.milk.recordMilk,
          onPress: () => router.replace({ pathname: '/cow/[id]/milk', params: { id: cow.id } }),
        },
        { text: strings.common.understood, onPress: () => router.back() },
      ]);
    } catch (err) {
      setError(domainErrorMessage(err));
    }
  };

  const photoCow = {
    name,
    photoLocalUri: newPhotoUri ?? existing?.photoLocalUri ?? null,
    photoPath: existing?.photoPath ?? null,
  };

  return (
    <ScreenContainer>
      <ScreenHeader title={existing ? strings.herd.editCow : strings.herd.addCow} />
      <OfflineBanner />
      <ScreenScroll>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.herd.changePhoto}
          onPress={choosePhoto}
          style={styles.photoBox}
        >
          <CowPhoto cow={photoCow} style={styles.photo} />
          <Text style={styles.photoHint}>{strings.herd.changePhoto}</Text>
        </Pressable>

        <TextField label={strings.herd.name} value={name} onChangeText={setName} />
        <TextField
          label={`${strings.herd.tag} (${strings.common.optional.toLowerCase()})`}
          value={tag}
          onChangeText={setTag}
          autoCapitalize="characters"
        />
        <TextField
          label={`${strings.herd.breed} (${strings.common.optional.toLowerCase()})`}
          value={breed}
          onChangeText={setBreed}
        />

        <Text style={styles.fieldLabel}>{strings.herd.birthDate}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.herd.birthDate}
          onPress={() => setShowDatePicker(true)}
          style={styles.dateButton}
        >
          <Text style={birthDate ? styles.dateValue : styles.datePlaceholder}>
            {birthDate ? `${birthDate} · ${formatAge(birthDate)}` : 'AAAA-MM-DD'}
          </Text>
        </Pressable>
        {showDatePicker ? (
          <DateTimePicker
            value={
              birthDate && isValidIsoDate(birthDate)
                ? new Date(`${birthDate}T12:00:00`)
                : new Date()
            }
            mode="date"
            maximumDate={new Date()}
            onChange={(event, date) => {
              setShowDatePicker(false);
              if (event.type === 'set' && date) setBirthDate(toIsoDate(date));
            }}
          />
        ) : null}
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{strings.herd.birthDateEstimated}</Text>
          <Switch
            value={estimated}
            onValueChange={setEstimated}
            trackColor={{ true: colors.primary }}
            accessibilityLabel={strings.herd.birthDateEstimated}
          />
        </View>

        <Text style={styles.fieldLabel}>{strings.herd.mother}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.herd.selectMother}
          onPress={() => setShowMotherPicker(true)}
          style={styles.dateButton}
        >
          <Text style={motherId ? styles.dateValue : styles.datePlaceholder}>
            {motherId ? motherName : strings.herd.noMotherOption}
          </Text>
        </Pressable>

        <TextField
          label={strings.herd.calvingCount}
          value={calvingCount}
          onChangeText={setCalvingCount}
          keyboardType="number-pad"
        />

        <Text style={styles.fieldLabel}>
          {strings.status.lactating} / {strings.status.dry}
        </Text>
        <SegmentedControl<LactationStatus>
          options={[
            { value: 'lactating', label: strings.status.lactating },
            { value: 'dry', label: strings.status.dry },
            { value: 'unknown', label: '—' },
          ]}
          value={lactation}
          onChange={setLactation}
        />

        <Text style={styles.fieldLabel}>
          {strings.status.pregnant} / {strings.status.open}
        </Text>
        <SegmentedControl<PregnancyStatus>
          options={[
            { value: 'pregnant', label: strings.status.pregnant },
            { value: 'open', label: strings.status.open },
            { value: 'unknown', label: '—' },
          ]}
          value={pregnancy}
          onChange={setPregnancy}
        />

        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <AppButton
          title={strings.common.save}
          onPress={save}
          disabled={name.trim() === ''}
          style={styles.saveButton}
        />
      </ScreenScroll>

      <Modal visible={showMotherPicker} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{strings.herd.selectMother}</Text>
            <TextInput
              style={styles.modalSearch}
              placeholder={strings.herd.searchPlaceholder}
              placeholderTextColor={colors.textSecondary}
              value={motherSearch}
              onChangeText={setMotherSearch}
              accessibilityLabel={strings.herd.searchPlaceholder}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMotherId(null);
                setShowMotherPicker(false);
              }}
              style={styles.modalRow}
            >
              <Text style={styles.modalRowText}>{strings.herd.noMotherOption}</Text>
            </Pressable>
            {motherOptions.slice(0, 30).map((option) => (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                onPress={() => {
                  setMotherId(option.id);
                  setShowMotherPicker(false);
                }}
                style={styles.modalRow}
              >
                <Text style={styles.modalRowText}>
                  {option.name}
                  {option.tagNumber ? `  ·  ${option.tagNumber}` : ''}
                </Text>
              </Pressable>
            ))}
            <AppButton
              title={strings.common.cancel}
              variant="secondary"
              onPress={() => setShowMotherPicker(false)}
              style={styles.modalCancel}
            />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function ScreenScroll({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  photoBox: {
    marginBottom: spacing.lg,
  },
  photo: {
    width: '100%',
    height: 150,
    borderRadius: radius.card,
  },
  photoHint: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.primary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  dateButton: {
    minHeight: touchTarget.field,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.borderInput,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  dateValue: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.textPrimary,
  },
  datePlaceholder: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.textSecondary,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  switchLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  error: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.md,
  },
  saveButton: {
    marginTop: spacing.xl,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(22, 33, 28, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.appBackground,
    borderTopLeftRadius: radius.mainCard,
    borderTopRightRadius: radius.mainCard,
    padding: spacing.lg,
    maxHeight: '75%',
  },
  modalTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  modalSearch: {
    minHeight: touchTarget.field,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.borderInput,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  modalRow: {
    minHeight: touchTarget.field,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    paddingHorizontal: spacing.xs,
  },
  modalRowText: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  modalCancel: {
    marginTop: spacing.md,
  },
});
