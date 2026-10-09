// One row in the list. Leads that arrive live flash yellow and fade back to
// white, so a new arrival is obvious on camera.
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { Lead } from './useLeads';

type Props = { lead: Lead; isLive: boolean };

export function LeadCard({ lead, isLive }: Props) {
  // 1 = fully highlighted, 0 = normal
  const highlight = useRef(new Animated.Value(isLive ? 1 : 0)).current;

  useEffect(() => {
    if (!isLive) return;
    // Start from full yellow even if this card was already on screen
    // (e.g. the /leads backfill rendered it a moment before the socket message).
    highlight.setValue(1);
    Animated.timing(highlight, {
      toValue: 0,
      duration: 4000,
      useNativeDriver: false, // backgroundColor can't use the native driver
    }).start();
  }, [isLive, highlight]);

  const backgroundColor = highlight.interpolate({
    inputRange: [0, 1],
    outputRange: ['#ffffff', '#fff3b0'],
  });

  const f = lead.fields;
  // Fall back to the lead id when the answers couldn't be fetched.
  const name =
    f.full_name || [f.first_name, f.last_name].filter(Boolean).join(' ') || `Lead ${lead.id}`;

  return (
    <Animated.View style={[styles.card, { backgroundColor }]}>
      <View style={styles.row}>
        <Text style={styles.name}>{name}</Text>
        {isLive && <Text style={styles.badge}>NEW</Text>}
      </View>
      {!!f.email && <Text style={styles.line}>✉ {f.email}</Text>}
      {!!f.phone_number && <Text style={styles.line}>☎ {f.phone_number}</Text>}
      <Text style={styles.meta}>
        Form {lead.formId} · {new Date(lead.createdTime).toLocaleString()}
      </Text>
      {!!lead.error && <Text style={styles.error}>Details unavailable: {lead.error}</Text>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 17, fontWeight: '600', color: '#111827' },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#f59e0b',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  line: { fontSize: 15, color: '#374151', marginTop: 4 },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 8 },
  error: { fontSize: 12, color: '#b91c1c', marginTop: 6 },
});
