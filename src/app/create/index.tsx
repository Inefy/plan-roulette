// src/app/create/index.tsx
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { Button, Card, Chip, Screen, Text } from '../../components';
import { theme } from '../../constants/theme';
import { planTemplateCategories } from '../../data/planTemplates';
import { useCreatePlan } from '../../features/create/CreatePlanProvider';
import type { BudgetTier, EnergyLevel, LocationMode, PlanCategory, WeatherMode } from '../../types/domain';
import { toDisplayLabel } from '../../utils/displayLabels';

const budgetTiers = ['free', 'low', 'moderate', 'high', 'splurge'] as const satisfies BudgetTier[];
const energyLevels = ['low', 'medium', 'high'] as const satisfies EnergyLevel[];
const locationModes = ['in_person', 'hybrid', 'remote'] as const satisfies LocationMode[];
const weatherModes = ['weather_flexible', 'indoor', 'outdoor'] as const satisfies WeatherMode[];

function toLabel(value: string) {
  return toDisplayLabel(value);
}

type FieldProps = {
  children: ReactNode;
  label: string;
};

function Field({ children, label }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text variant="label">{label}</Text>
      {children}
    </View>
  );
}

type ChipGroupProps<Value extends string> = {
  onSelect: (value: Value) => void;
  selectedValue: Value;
  values: readonly Value[];
};

function ChipGroup<Value extends string>({ onSelect, selectedValue, values }: ChipGroupProps<Value>) {
  return (
    <View style={styles.chipGrid}>
      {values.map((value) => (
        <Chip
          key={value}
          onPress={() => onSelect(value)}
          selected={selectedValue === value}
          title={toLabel(value)}
          tone={selectedValue === value ? 'red' : 'neutral'}
        />
      ))}
    </View>
  );
}

export default function CreateRoute() {
  const router = useRouter();
  const { draft, errorMessage, generateOptions, setDraftValue, toggleCategory, validationErrors } = useCreatePlan();

  function handleGenerateOptions() {
    const options = generateOptions();

    if (options) {
      router.push('/create/options');
    }
  }

  return (
    <Screen contentContainerStyle={styles.screen} padded={false} scroll>
      <View style={styles.header}>
        <Text variant="title">Create Plan</Text>
        <Text color="textSecondary">Set the shape of the hangout before the wheel starts spinning.</Text>
      </View>

      <Card style={styles.formCard} variant="warm">
        <Field label="Title">
          <TextInput
            accessibilityLabel="Plan title"
            onChangeText={(value) => setDraftValue('title', value)}
            placeholder="Friday dinner, study break, rainy day backup"
            placeholderTextColor={theme.colors.sidewalkGray}
            returnKeyType="next"
            style={styles.input}
            value={draft.title}
          />
        </Field>

        <View style={styles.row}>
          <Field label="Window start">
            <TextInput
              accessibilityLabel="Window start"
              autoCapitalize="none"
              onChangeText={(value) => setDraftValue('startsAt', value)}
              placeholder="2026-06-01T18:00"
              placeholderTextColor={theme.colors.sidewalkGray}
              style={styles.input}
              value={draft.startsAt}
            />
          </Field>
          <Field label="Window end">
            <TextInput
              accessibilityLabel="Window end"
              autoCapitalize="none"
              onChangeText={(value) => setDraftValue('endsAt', value)}
              placeholder="2026-06-01T22:00"
              placeholderTextColor={theme.colors.sidewalkGray}
              style={styles.input}
              value={draft.endsAt}
            />
          </Field>
        </View>

        <Field label="Budget">
          <ChipGroup
            onSelect={(value) => setDraftValue('budgetTier', value)}
            selectedValue={draft.budgetTier}
            values={budgetTiers}
          />
        </Field>

        <Field label="Categories">
          <View style={styles.chipGrid}>
            {planTemplateCategories.map((category: PlanCategory) => (
              <Chip
                key={category}
                onPress={() => toggleCategory(category)}
                selected={draft.categories.includes(category)}
                title={toLabel(category)}
                tone={draft.categories.includes(category) ? 'orange' : 'neutral'}
              />
            ))}
          </View>
        </Field>

        <Field label="Energy">
          <ChipGroup
            onSelect={(value) => setDraftValue('energyLevel', value)}
            selectedValue={draft.energyLevel}
            values={energyLevels}
          />
        </Field>

        <Field label="Location mode">
          <ChipGroup
            onSelect={(value) => setDraftValue('locationMode', value)}
            selectedValue={draft.locationMode}
            values={locationModes}
          />
        </Field>

        <Field label="Weather mode">
          <ChipGroup
            onSelect={(value) => setDraftValue('weatherMode', value)}
            selectedValue={draft.weatherMode}
            values={weatherModes}
          />
        </Field>

        <Field label="Group size estimate">
          <TextInput
            accessibilityLabel="Group size estimate"
            inputMode="numeric"
            keyboardType="number-pad"
            onChangeText={(value) => setDraftValue('groupSizeEstimate', value)}
            placeholder="4"
            placeholderTextColor={theme.colors.sidewalkGray}
            style={styles.input}
            value={draft.groupSizeEstimate}
          />
        </Field>

        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text variant="label">Allow age-sensitive categories</Text>
            <Text color="textSecondary" variant="caption">
              Bars and nightlife still include non-alcoholic choices.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Allow age-sensitive categories"
            onValueChange={(value) => setDraftValue('allowAgeSensitive', value)}
            thumbColor={draft.allowAgeSensitive ? theme.colors.rouletteRed : theme.colors.surface}
            trackColor={{ false: theme.colors.disabled, true: theme.colors.nachoYellow }}
            value={draft.allowAgeSensitive}
          />
        </View>

        {validationErrors.length > 0 ? (
          <View accessibilityRole="alert" style={styles.messageBox}>
            {validationErrors.map((error) => (
              <Text key={error} color="nopeCoral" variant="caption">
                {error}
              </Text>
            ))}
          </View>
        ) : null}

        {errorMessage ? (
          <View accessibilityRole="alert" style={styles.messageBox}>
            <Text color="nopeCoral" variant="caption">
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <Button fullWidth onPress={handleGenerateOptions} size="lg" title="Generate options" />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  field: {
    flex: 1,
    gap: theme.spacing.sm,
    minWidth: 220,
  },
  formCard: {
    gap: theme.spacing.xl,
  },
  header: {
    gap: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    color: theme.colors.textPrimary,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  messageBox: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.nopeCoral,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  screen: {
    gap: theme.spacing.xl,
    padding: theme.spacing.xl,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    minHeight: 52,
  },
  switchText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
});
