import AsyncStorage from "@react-native-async-storage/async-storage";

export type AnnotationContext = {
  location: string;
  coachName: string;
  language: string;
  tone: string;
  personalNotes: string;
};

export const DEFAULT_ANNOTATION_CONTEXT: AnnotationContext = {
  location: "",
  coachName: "Chronos教练",
  language: "中文",
  tone: "简洁、鼓励，但不过度热情",
  personalNotes: "",
};

const STORAGE_KEY = "chronos.annotation-context.v1";
const LEGACY_DEFAULT_LOCATION = "徐汇体育馆游泳";

export async function loadAnnotationContext(): Promise<AnnotationContext> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ANNOTATION_CONTEXT;
    const value = JSON.parse(raw) as Partial<AnnotationContext>;
    const context = { ...DEFAULT_ANNOTATION_CONTEXT, ...value };
    if (context.location === LEGACY_DEFAULT_LOCATION) {
      context.location = "";
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    }
    return context;
  } catch {
    return DEFAULT_ANNOTATION_CONTEXT;
  }
}

export async function saveAnnotationContext(value: AnnotationContext): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}
