// src/components/PlaceholderScreen.tsx
import { StyleSheet } from 'react-native';

import { theme } from '../constants/theme';
import { Card } from './Card';
import { Chip } from './Chip';
import { Screen } from './Screen';
import { Text } from './Text';

type PlaceholderScreenProps = {
  route: string;
  title: string;
};

export function PlaceholderScreen({ route, title }: PlaceholderScreenProps) {
  return (
    <Screen centered>
      <Card style={styles.card} variant="elevated">
        <Chip title="MVP scaffold" tone="orange" />
        <Text align="center" variant="title">
          {title}
        </Text>
        <Text align="center" color="poolBlue" variant="label">
          {route}
        </Text>
        <Text align="center" color="textSecondary">
          Placeholder screen for the MVP route scaffold.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: theme.spacing.md,
    maxWidth: 420,
    width: '100%',
  },
});
