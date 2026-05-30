// src/features/plan/components/WinnerCard.tsx
import { StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Text } from '../../../components';
import { theme } from '../../../constants/theme';

type WinnerCardProps = {
  actionLabel?: string;
  detail?: string;
  onActionPress?: () => void;
  subtitle?: string;
  title: string;
};

export function WinnerCard({
  actionLabel,
  detail,
  onActionPress,
  subtitle,
  title,
}: WinnerCardProps) {
  return (
    <Card style={styles.card} variant="elevated">
      <View style={styles.badgeRow}>
        <Chip title="Winner" tone="yellow" />
      </View>
      <Text align="center" variant="title">
        {title}
      </Text>
      {subtitle ? (
        <Text align="center" color="textSecondary">
          {subtitle}
        </Text>
      ) : null}
      {detail ? (
        <Text align="center" color="textSecondary" variant="caption">
          {detail}
        </Text>
      ) : null}
      {actionLabel && onActionPress ? <Button fullWidth onPress={onActionPress} title={actionLabel} variant="secondary" /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  badgeRow: {
    alignItems: 'center',
  },
  card: {
    alignItems: 'center',
    borderColor: theme.colors.nachoYellow,
    borderWidth: 2,
    padding: theme.spacing.xl,
  },
});
