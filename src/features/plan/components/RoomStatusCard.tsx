// src/features/plan/components/RoomStatusCard.tsx
import { StyleSheet, View } from 'react-native';

import { Card, Chip, ProgressBar, Text, type ChipTone } from '../../../components';
import { theme, type ThemeColor } from '../../../constants/theme';

type RoomStatusCardProps = {
  description?: string;
  participantLabel?: string;
  progress?: number;
  progressColor?: ThemeColor;
  statusLabel: string;
  statusTone?: ChipTone;
  title: string;
};

export function RoomStatusCard({
  description,
  participantLabel,
  progress,
  progressColor = 'poolBlue',
  statusLabel,
  statusTone = 'blue',
  title,
}: RoomStatusCardProps) {
  return (
    <Card variant="warm">
      <View style={styles.header}>
        <Text variant="subtitle">{title}</Text>
        <Chip title={statusLabel} tone={statusTone} />
      </View>
      {description ? <Text color="textSecondary">{description}</Text> : null}
      {typeof progress === 'number' ? (
        <ProgressBar accessibilityLabel={`${title} progress`} color={progressColor} value={progress} />
      ) : null}
      {participantLabel ? (
        <Text color="textSecondary" variant="caption">
          {participantLabel}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
});
