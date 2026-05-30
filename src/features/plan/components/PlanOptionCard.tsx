// src/features/plan/components/PlanOptionCard.tsx
import { StyleSheet, View } from 'react-native';

import { Card, Chip, Text, type ChipTone } from '../../../components';
import { theme } from '../../../constants/theme';

type PlanOptionCardProps = {
  accessibilityLabel?: string;
  description?: string;
  disabled?: boolean;
  meta?: string;
  onPress?: () => void;
  selected?: boolean;
  tag?: string;
  tagTone?: ChipTone;
  title: string;
};

export function PlanOptionCard({
  accessibilityLabel,
  description,
  disabled = false,
  meta,
  onPress,
  selected = false,
  tag,
  tagTone = 'orange',
  title,
}: PlanOptionCardProps) {
  return (
    <Card
      accessibilityLabel={accessibilityLabel ?? title}
      disabled={disabled}
      onPress={onPress}
      style={[styles.card, selected && styles.selected]}
      variant="elevated"
    >
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text variant="subtitle">{title}</Text>
          {meta ? (
            <Text color="textSecondary" variant="caption">
              {meta}
            </Text>
          ) : null}
        </View>
        {tag ? <Chip selected={selected} title={tag} tone={tagTone} /> : null}
      </View>
      {description ? <Text color="textSecondary">{description}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 112,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  selected: {
    borderColor: theme.colors.rouletteRed,
    borderWidth: 2,
  },
  titleGroup: {
    flex: 1,
    gap: theme.spacing.xs,
  },
});
