// The one and only screen: a live list of Meta leads.
// Data + realtime logic is in src/useLeads.ts; this file is just UI.
import { StatusBar } from 'expo-status-bar';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LeadCard } from './src/LeadCard';
import { API_URL, useLeads, type ConnectionStatus } from './src/useLeads';

const STATUS_STYLE: Record<ConnectionStatus, { label: string; color: string }> = {
  connecting: { label: 'Connecting…', color: '#9ca3af' },
  connected: { label: 'Connected', color: '#16a34a' },
  reconnecting: { label: 'Reconnecting…', color: '#f59e0b' },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        {API_URL ? <LeadsScreen /> : <MissingConfig />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function LeadsScreen() {
  const { leads, status, liveIds } = useLeads();
  const pill = STATUS_STYLE[status];

  return (
    <>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Leads</Text>
          <Text style={styles.subtitle}>{leads.length} total · live from Meta Lead Ads</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: pill.color }]}>
          <Text style={styles.pillText}>{pill.label}</Text>
        </View>
      </View>

      <FlatList
        data={leads}
        keyExtractor={(lead) => lead.id}
        renderItem={({ item }) => <LeadCard lead={item} isLive={liveIds.has(item.id)} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No leads yet.{'\n'}Submit one from the Meta Lead Ads Testing Tool.
          </Text>
        }
        contentContainerStyle={{ paddingVertical: 8 }}
      />
    </>
  );
}

function MissingConfig() {
  return (
    <Text style={styles.empty}>
      Set EXPO_PUBLIC_API_URL in app/.env (see .env.example), then restart Expo.
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f4f6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 26, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  empty: { textAlign: 'center', color: '#6b7280', marginTop: 48, paddingHorizontal: 24, lineHeight: 22 },
});
