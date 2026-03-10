import { StyleSheet, View, Text, ScrollView, SafeAreaView } from 'react-native';
import { Twilight } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function HomeScreen() {
  const now = new Date();
  const formatted = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER NAVBAR */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>C</Text>
          </View>
          <Text style={styles.headerTitle}>Today</Text>
        </View>

        <View style={styles.authButton}>
          <Text style={styles.authButtonText}>Sign in</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* CURRENT DAY SUMMARY */}
        <View style={styles.dateHeader}>
          <Text style={styles.dateText}>{formatted}</Text>
        </View>

        {/* EMPTY STATE */}
        <View style={[styles.glassContainer, styles.glowContainer, styles.emptyStateContainer]}>
          <View style={styles.iconCircle}>
            <IconSymbol name="plus" size={24} color={Twilight.lantern} />
          </View>
          <Text style={styles.emptyStateTitle}>A quiet day</Text>
          <Text style={styles.emptyStateDesc}>
            You have no tasks scheduled for today. Rest, or pull something from your inbox.
          </Text>
        </View>

        {/* UPCOMING / CALENDAR GLANCE */}
        <View style={styles.glassContainer}>
          <Text style={styles.sectionLabel}>Upcoming</Text>
          <View style={styles.placeholderBox}>
            <Text style={styles.placeholderText}>Nothing imminent</Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Twilight.void,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: Twilight.glass,
    borderRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: Twilight.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Twilight.lanternSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontFamily: 'Outfit',
    fontWeight: 'bold',
    fontSize: 16,
    color: Twilight.lantern,
  },
  headerTitle: {
    fontFamily: 'Outfit',
    fontWeight: '600',
    fontSize: 18,
    color: Twilight.text,
  },
  authButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Twilight.borderLight,
  },
  authButtonText: {
    color: Twilight.textMuted,
    fontSize: 13,
  },
  scrollContent: {
    padding: 16,
    gap: 24,
  },
  dateHeader: {
    paddingHorizontal: 8,
  },
  dateText: {
    color: Twilight.textMuted,
    fontSize: 14,
  },
  glassContainer: {
    backgroundColor: Twilight.glass,
    borderRadius: 24,
    padding: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: Twilight.border,
  },
  glowContainer: {
    shadowColor: Twilight.lantern,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  emptyStateContainer: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Twilight.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyStateTitle: {
    fontFamily: 'Outfit',
    fontWeight: '500',
    fontSize: 18,
    color: Twilight.textSoft,
  },
  emptyStateDesc: {
    color: Twilight.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontFamily: 'Outfit',
    fontWeight: '600',
    color: Twilight.textSoft,
    fontSize: 16,
    marginBottom: 16,
  },
  placeholderBox: {
    borderWidth: 1,
    borderColor: Twilight.borderLight,
    borderStyle: 'dashed',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
  },
  placeholderText: {
    color: Twilight.textMuted,
    fontSize: 13,
  },
});
