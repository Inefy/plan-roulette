// src/app/create/options.tsx
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Chip, EmptyState, LoadingState, Screen, Text } from '../../components';
import { theme } from '../../constants/theme';
import { useCreatePlan } from '../../features/create/CreatePlanProvider';
import { PlanOptionCard } from '../../features/plan/components';
import type { GeneratedPlanOption } from '../../lib/planGenerator';
import { toDisplayLabel } from '../../utils/displayLabels';

function toLabel(value: string) {
  return toDisplayLabel(value);
}

function formatDuration(option: GeneratedPlanOption) {
  return `${option.duration.minMinutes}-${option.duration.maxMinutes} min`;
}

function formatOptionMeta(option: GeneratedPlanOption) {
  return [formatDuration(option), toLabel(option.budgetTier), toLabel(option.energyLevel)].join(' | ');
}

export default function CreateOptionsRoute() {
  const router = useRouter();
  const {
    createRoomWithOptions,
    errorMessage,
    generateOptions,
    generatedOptions,
    isCreatingRoom,
    validationErrors,
  } = useCreatePlan();

  function handleRegenerate() {
    generateOptions();
  }

  async function handleCreateRoom() {
    const invite = await createRoomWithOptions();

    if (invite) {
      router.push('/create/invite');
    }
  }

  return (
    <Screen contentContainerStyle={styles.screen} padded={false} scroll>
      <Card style={styles.heroCard} variant="elevated">
        <Chip title="Deck preview" tone="orange" />
        <View style={styles.header}>
          <Text variant="display">Plan Options</Text>
          <Text color="textSecondary">Review the first deck before creating the invite room.</Text>
        </View>
      </Card>

      {generatedOptions.length === 0 ? (
        <Card variant="warm">
          <EmptyState
            action={<Button onPress={handleRegenerate} title="Generate deck" />}
            message="Add the required details first, then generate the first option deck."
            title="No options yet"
          />
        </Card>
      ) : (
        <>
          <Card style={styles.summaryCard} variant="warm">
            <View style={styles.summaryText}>
              <Text variant="subtitle">{generatedOptions.length} options ready</Text>
              <Text color="textSecondary">This deck was generated locally and stays here offline. Creating the room needs internet.</Text>
            </View>
            <View style={styles.actionRow}>
              <Button disabled={isCreatingRoom} onPress={() => router.back()} title="Edit" variant="outline" />
              <Button disabled={isCreatingRoom} onPress={handleRegenerate} title="Regenerate" variant="secondary" />
            </View>
          </Card>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="subtitle">Suggested Deck</Text>
              <Text color="textSecondary" variant="caption">
                Best matches first
              </Text>
            </View>
            <View style={styles.optionList}>
              {generatedOptions.map((option) => (
                <PlanOptionCard
                  key={option.templateId}
                  description={option.description}
                  meta={formatOptionMeta(option)}
                  tag={toLabel(option.category)}
                  tagTone="orange"
                  title={option.title}
                />
              ))}
            </View>
          </View>
        </>
      )}

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
          {generatedOptions.length > 0 ? (
            <Button disabled={isCreatingRoom} loading={isCreatingRoom} onPress={handleCreateRoom} title="Retry create room" variant="outline" />
          ) : null}
        </View>
      ) : null}

      {isCreatingRoom ? <LoadingState message="Creating room and saving options..." /> : null}

      <View style={styles.footerActions}>
        <Button
          disabled={generatedOptions.length === 0}
          fullWidth
          loading={isCreatingRoom}
          onPress={handleCreateRoom}
          size="lg"
          title="Create room and invite"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  footerActions: {
    gap: theme.spacing.md,
  },
  header: {
    gap: theme.spacing.sm,
  },
  heroCard: {
    gap: theme.spacing.lg,
  },
  messageBox: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.nopeCoral,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  optionList: {
    gap: theme.spacing.md,
  },
  screen: {
    gap: theme.spacing.xl,
    padding: theme.spacing.xl,
  },
  section: {
    gap: theme.spacing.md,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  summaryCard: {
    alignItems: 'flex-start',
    gap: theme.spacing.lg,
  },
  summaryText: {
    gap: theme.spacing.xs,
  },
});
