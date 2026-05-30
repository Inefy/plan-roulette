// src/features/plan/components/VoteButtonRow.tsx
import { StyleSheet, View } from 'react-native';

import { Button } from '../../../components';
import { theme } from '../../../constants/theme';

type VoteChoice = 'yes' | 'no';

type VoteButtonRowProps = {
  disabled?: boolean;
  loadingChoice?: VoteChoice;
  noLabel?: string;
  onNoPress?: () => void;
  onYesPress?: () => void;
  yesLabel?: string;
};

export function VoteButtonRow({
  disabled = false,
  loadingChoice,
  noLabel = 'Pass',
  onNoPress,
  onYesPress,
  yesLabel = 'I am in',
}: VoteButtonRowProps) {
  return (
    <View accessibilityRole="toolbar" style={styles.row}>
      <Button
        accessibilityLabel={yesLabel}
        disabled={disabled}
        fullWidth
        loading={loadingChoice === 'yes'}
        onPress={onYesPress}
        style={styles.button}
        title={yesLabel}
        variant="success"
      />
      <Button
        accessibilityLabel={noLabel}
        disabled={disabled}
        fullWidth
        loading={loadingChoice === 'no'}
        onPress={onNoPress}
        style={styles.button}
        title={noLabel}
        variant="danger"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    minHeight: 56,
    width: '100%',
  },
});
