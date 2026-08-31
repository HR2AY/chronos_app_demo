import { PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";

type SectionProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
}>;

export function Section({ title, subtitle, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d9e1ec",
    borderRadius: 8,
    padding: 14,
  },
  header: {
    marginBottom: 12,
  },
  headerText: {
    gap: 2,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: "#102033",
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: "#607087",
  },
  body: {
    gap: 12,
  },
});
