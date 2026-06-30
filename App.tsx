import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as Sharing from "expo-sharing";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import DateTimePicker from "@react-native-community/datetimepicker";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

WebBrowser.maybeCompleteAuthSession();

const STORAGE_KEY = "bcnPlantTracker.observations.v1";
const PLANTNET_API_KEY = process.env.EXPO_PUBLIC_PLANTNET_API_KEY ?? "";
const PLANTNET_ENDPOINT = "https://my-api.plantnet.org/v2/identify/all";
const BCN_LOGO = require("./assets/bcn-logo.png");
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const LOCAL_OWNER_ID = "local_user";
const DEFAULT_PRIVACY_LEVEL: PrivacyLevel = "share with BCN";
const DEFAULT_SYNC_STATUS: SyncStatus = "local only";
const PLANT_PHOTOS_BUCKET = "plant-photos";
const DELETE_ACCOUNT_URL =
  "https://greenjosh327.github.io/bcn-plant-scout/delete-account/";
const AUTH_REDIRECT_PATH = "auth/callback";
const AUTH_REDIRECT_URL = makeRedirectUri({
  scheme: "bcnplantscout",
  path: AUTH_REDIRECT_PATH
});
const supabase =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false
        }
      })
    : null;

const isExpoGoAndroid =
  Constants.appOwnership === "expo" && Platform.OS === "android";

if (!isExpoGoAndroid) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true
    })
  });
}

type CollectionStatus =
  | "not ready"
  | "ready now"
  | "return later"
  | "collected"
  | "do not collect";

type CollectionType =
  | "seeds"
  | "cuttings"
  | "nuts"
  | "berries"
  | "scion wood"
  | "observation only"
  | "unknown";

type ObservationPhoto = {
  id?: string;
  uri: string;
  fileName?: string;
  storagePath?: string;
  addedAt: string;
  syncStatus?: SyncStatus;
  syncError?: string;
};

type ReminderLeadDays = 1 | 3 | 7;
type PrivacyLevel = "private" | "share with BCN" | "public approximate";
type SyncStatus = "local only" | "pending upload" | "synced" | "sync failed";
type SavedFilter = "all" | "return later" | "ready now" | "needs sync";
type ReturnFilter = "all" | "upcoming" | "overdue" | "ready now" | "no exact date";
type SavedReturnFilter = "any" | "has date" | "no date" | "overdue" | "next 30";
type SavedSort = "date" | "name" | "ready now" | "distance";
type MapStatusFilter = "all" | CollectionStatus | "need return" | "archived";
type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type PlantSuggestion = {
  commonName: string;
  scientificName: string;
  otherNames: string[];
  confidenceScore?: number;
};

type PlantObservation = {
  id: string;
  cloudId?: string;
  ownerId?: string;
  privacyLevel?: PrivacyLevel;
  syncStatus?: SyncStatus;
  syncError?: string;
  lastSyncedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  commonName: string;
  scientificName?: string;
  otherNames?: string[];
  confidenceScore?: number;
  identificationStatus?: "manual" | "suggested" | "needs ID" | "failed";
  identificationError?: string;
  identifiedAt?: string;
  userConfirmed: boolean;
  photoUri: string;
  photoFileName?: string;
  photoStoragePath?: string;
  extraPhotos?: ObservationPhoto[];
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  observedAt: string;
  notes?: string;
  returnDate?: string;
  reminderLeadDays?: ReminderLeadDays;
  reminderScheduledFor?: string;
  reminderNotificationId?: string;
  gatherNotes?: string;
  collectionType?: CollectionType;
  collectionTypes?: CollectionType[];
  collectionStatus?: CollectionStatus;
  favorite?: boolean;
  tags?: string[];
};

type DraftObservation = {
  commonName: string;
  scientificName: string;
  otherNames: string[];
  notes: string;
  returnDate: string;
  reminderLeadDays: ReminderLeadDays;
  gatherNotes: string;
  confidenceScore?: number;
  identificationStatus?: PlantObservation["identificationStatus"];
  identificationError?: string;
  identifiedAt?: string;
  userConfirmed: boolean;
  collectionStatus: CollectionStatus;
  collectionTypes: CollectionType[];
  privacyLevel: PrivacyLevel;
  favorite: boolean;
  tagsText: string;
};

const blankDraft: DraftObservation = {
  commonName: "",
  scientificName: "",
  otherNames: [],
  notes: "",
  returnDate: "",
  reminderLeadDays: 3,
  gatherNotes: "",
  userConfirmed: false,
  collectionStatus: "return later",
  collectionTypes: ["seeds"],
  privacyLevel: DEFAULT_PRIVACY_LEVEL,
  favorite: false,
  tagsText: ""
};

const collectionStatuses: CollectionStatus[] = [
  "return later",
  "ready now",
  "not ready",
  "collected",
  "do not collect"
];

const collectionTypes: CollectionType[] = [
  "seeds",
  "cuttings",
  "nuts",
  "berries",
  "scion wood",
  "observation only",
  "unknown"
];

const privacyLevels: PrivacyLevel[] = [
  "share with BCN",
  "private",
  "public approximate"
];

const csvColumns: {
  header: string;
  value: (row: PlantObservation) => unknown;
}[] = [
  { header: "Record ID", value: (row) => row.id },
  { header: "Owner ID", value: (row) => row.ownerId ?? LOCAL_OWNER_ID },
  { header: "Cloud ID", value: (row) => row.cloudId ?? "" },
  { header: "Privacy Level", value: (row) => row.privacyLevel ?? DEFAULT_PRIVACY_LEVEL },
  { header: "Sync Status", value: (row) => row.syncStatus ?? DEFAULT_SYNC_STATUS },
  { header: "Last Synced At", value: (row) => row.lastSyncedAt ?? "" },
  { header: "Created At", value: (row) => row.createdAt ?? row.observedAt },
  { header: "Updated At", value: (row) => row.updatedAt ?? row.observedAt },
  { header: "Common Name", value: (row) => row.commonName },
  { header: "Scientific Name", value: (row) => row.scientificName ?? "" },
  { header: "Other Names", value: (row) => row.otherNames ?? [] },
  { header: "ID Confidence (%)", value: (row) => formatPercent(row.confidenceScore) },
  { header: "ID Status", value: (row) => row.identificationStatus ?? "manual" },
  { header: "ID Error", value: (row) => row.identificationError ?? "" },
  { header: "User Confirmed", value: (row) => formatBoolean(row.userConfirmed) },
  { header: "Latitude", value: (row) => row.latitude },
  { header: "Longitude", value: (row) => row.longitude },
  { header: "GPS Accuracy (m)", value: (row) => formatMeters(row.accuracyMeters) },
  { header: "Observed Date", value: (row) => formatDate(row.observedAt) },
  { header: "Observed Time", value: (row) => formatTime(row.observedAt) },
  { header: "Observed Timestamp", value: (row) => row.observedAt },
  { header: "Identified Date", value: (row) => formatDate(row.identifiedAt) },
  { header: "Identified Time", value: (row) => formatTime(row.identifiedAt) },
  { header: "Photo File Name", value: (row) => row.photoFileName ?? "" },
  { header: "Photo URI", value: (row) => row.photoUri },
  { header: "Photo Storage Path", value: (row) => row.photoStoragePath ?? "" },
  {
    header: "Extra Photo Files",
    value: (row) => row.extraPhotos?.map((item) => item.fileName ?? getFileName(item.uri)) ?? []
  },
  { header: "Notes", value: (row) => row.notes ?? "" },
  { header: "Return Date", value: (row) => row.returnDate ?? "" },
  { header: "Reminder Heads-Up Days", value: (row) => row.reminderLeadDays ?? "" },
  { header: "Reminder Scheduled For", value: (row) => row.reminderScheduledFor ?? "" },
  { header: "Gather Notes", value: (row) => row.gatherNotes ?? "" },
  {
    header: "Collection Interests",
    value: (row) => row.collectionTypes ?? row.collectionType ?? ""
  },
  { header: "Collection Status", value: (row) => row.collectionStatus ?? "" },
  { header: "Favorite", value: (row) => formatBoolean(row.favorite ?? false) },
  { header: "Tags", value: (row) => row.tags ?? [] }
];

type AppScreen =
  | "home"
  | "new"
  | "saved"
  | "map"
  | "detail"
  | "returns"
  | "cloud"
  | "account"
  | "export"
  | "about";

const menuItems: { label: string; screen: AppScreen }[] = [
  { label: "Home", screen: "home" },
  { label: "Add New Plant", screen: "new" },
  { label: "Saved Plants", screen: "saved" },
  { label: "Map", screen: "map" },
  { label: "Returns", screen: "returns" },
  { label: "Cloud Prep", screen: "cloud" },
  { label: "Account", screen: "account" },
  { label: "Export", screen: "export" },
  { label: "About BCN", screen: "about" }
];

const savedFilters: { label: string; value: SavedFilter }[] = [
  { label: "All", value: "all" },
  { label: "Return Later", value: "return later" },
  { label: "Ready Now", value: "ready now" },
  { label: "Needs Sync", value: "needs sync" }
];

const returnFilters: { label: string; value: ReturnFilter }[] = [
  { label: "All", value: "all" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Overdue", value: "overdue" },
  { label: "Ready Now", value: "ready now" },
  { label: "No Date", value: "no exact date" }
];

const savedReturnFilters: { label: string; value: SavedReturnFilter }[] = [
  { label: "Any Return", value: "any" },
  { label: "Has Date", value: "has date" },
  { label: "No Date", value: "no date" },
  { label: "Overdue", value: "overdue" },
  { label: "Next 30", value: "next 30" }
];

const savedSortOptions: { label: string; value: SavedSort }[] = [
  { label: "Newest", value: "date" },
  { label: "Name", value: "name" },
  { label: "Ready", value: "ready now" },
  { label: "Distance", value: "distance" }
];

const mapStatusFilters: { label: string; value: MapStatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Need Return", value: "need return" },
  { label: "Ready", value: "ready now" },
  { label: "Collected", value: "collected" },
  { label: "Archived", value: "archived" }
];

export default function App() {
  const mapRef = useRef<MapView | null>(null);
  const [observations, setObservations] = useState<PlantObservation[]>([]);
  const [draft, setDraft] = useState<DraftObservation>(blankDraft);
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [plantSuggestions, setPlantSuggestions] = useState<PlantSuggestion[]>([]);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [screen, setScreen] = useState<AppScreen>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingObservationId, setEditingObservationId] = useState<string | null>(
    null
  );
  const [showReturnDatePicker, setShowReturnDatePicker] = useState(false);
  const [savedFilter, setSavedFilter] = useState<SavedFilter>("all");
  const [savedSearch, setSavedSearch] = useState("");
  const [savedCollectionTypeFilter, setSavedCollectionTypeFilter] =
    useState<CollectionType | "all">("all");
  const [savedReturnFilter, setSavedReturnFilter] =
    useState<SavedReturnFilter>("any");
  const [savedSort, setSavedSort] = useState<SavedSort>("date");
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [mapStatusFilter, setMapStatusFilter] = useState<MapStatusFilter>("all");
  const [mapCollectionTypeFilter, setMapCollectionTypeFilter] =
    useState<CollectionType | "all">("all");
  const [mapReturnReadyOnly, setMapReturnReadyOnly] = useState(false);
  const [mapFavoritesOnly, setMapFavoritesOnly] = useState(false);
  const [mapSearch, setMapSearch] = useState("");
  const [mapNearbyOnly, setMapNearbyOnly] = useState(false);
  const [mapType, setMapType] = useState<"standard" | "satellite">("standard");
  const [selectedMapObservationId, setSelectedMapObservationId] =
    useState<string | null>(null);
  const [returnFilter, setReturnFilter] = useState<ReturnFilter>("all");
  const [selectedObservationId, setSelectedObservationId] = useState<string | null>(
    null
  );
  const [supabaseStatus, setSupabaseStatus] = useState<
    "not checked" | "checking" | "configured" | "reachable" | "failed"
  >("not checked");
  const [supabaseMessage, setSupabaseMessage] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentLocation, setCurrentLocation] =
    useState<Location.LocationObject | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<{
    status: "success" | "failed";
    records: number;
    photos: number;
    finishedAt: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    loadObservations();
  }, []);

  useEffect(() => {
    if (screen !== "new") {
      return;
    }

    let isActive = true;
    let subscription: Location.LocationSubscription | undefined;

    async function watchGps() {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted || !isActive) {
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High
      });
      if (isActive) {
        setLocation(current);
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          distanceInterval: 1,
          timeInterval: 2500
        },
        (nextLocation) => {
          setLocation((previous) =>
            isBetterLocation(previous, nextLocation) ? nextLocation : previous
          );
        }
      );
    }

    watchGps();

    return () => {
      isActive = false;
      subscription?.remove();
    };
  }, [screen]);

  useEffect(() => {
    if (screen === "map" && !mapRegion) {
      initializeMapRegion();
    }
  }, [mapRegion, observations, screen]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setAuthUserId(user?.id ?? null);
      setAuthUserEmail(user?.email ?? null);
      setAccountEmail(user?.email ?? "");
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      setAuthUserId(user?.id ?? null);
      setAuthUserEmail(user?.email ?? null);
      setAccountEmail(user?.email ?? "");
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const sortedObservations = useMemo(
    () =>
      [...observations].sort(
        (a, b) =>
          new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime()
      ),
    [observations]
  );

  const savedBaseObservations = useMemo(() => {
    const searchText = savedSearch.trim().toLowerCase();
    const today = startOfDay(new Date());
    const next30 = new Date(today);
    next30.setDate(today.getDate() + 30);

    const filtered = observations.filter((observation) => {
      if (savedFilter === "needs sync") {
        const syncStatus = observation.syncStatus ?? DEFAULT_SYNC_STATUS;
        if (syncStatus !== "pending upload" && syncStatus !== "sync failed") {
          return false;
        }
      } else if (
        savedFilter !== "all" &&
        observation.collectionStatus !== savedFilter
      ) {
        return false;
      }

      if (
        savedCollectionTypeFilter !== "all" &&
        !getCollectionTypes(observation).includes(savedCollectionTypeFilter)
      ) {
        return false;
      }

      const returnDate = observation.returnDate
        ? parseDateOnly(observation.returnDate)
        : undefined;
      if (savedReturnFilter === "has date" && !returnDate) {
        return false;
      }
      if (savedReturnFilter === "no date" && returnDate) {
        return false;
      }
      if (
        savedReturnFilter === "overdue" &&
        (!returnDate || returnDate >= today)
      ) {
        return false;
      }
      if (
        savedReturnFilter === "next 30" &&
        (!returnDate || returnDate < today || returnDate > next30)
      ) {
        return false;
      }

      if (!searchText) {
        return true;
      }

      return getObservationSearchText(observation).includes(searchText);
    });

    return filtered.sort((a, b) => {
      if (savedSort === "name") {
        return a.commonName.localeCompare(b.commonName);
      }
      if (savedSort === "ready now") {
        const aReady = a.collectionStatus === "ready now" ? 0 : 1;
        const bReady = b.collectionStatus === "ready now" ? 0 : 1;
        return aReady - bReady || getObservedTime(b) - getObservedTime(a);
      }
      if (savedSort === "distance" && currentLocation) {
        return (
          getDistanceMeters(currentLocation.coords, a) -
            getDistanceMeters(currentLocation.coords, b) ||
          getObservedTime(b) - getObservedTime(a)
        );
      }
      return getObservedTime(b) - getObservedTime(a);
    });
  }, [
    currentLocation,
    observations,
    savedCollectionTypeFilter,
    savedFilter,
    savedReturnFilter,
    savedSearch,
    savedSort
  ]);

  const homeStats = useMemo(() => {
    const now = new Date();
    const next30Days = new Date(now);
    next30Days.setDate(now.getDate() + 30);

    const needsReturn = observations.filter((observation) => {
      const returnDate = observation.returnDate
        ? parseDateOnly(observation.returnDate)
        : undefined;
      return returnDate && returnDate >= now && returnDate <= next30Days;
    }).length;

    const identified = observations.filter(
      (observation) => observation.identificationStatus === "suggested"
    ).length;

    const extraPhotos = observations.reduce(
      (total, observation) => total + (observation.extraPhotos?.length ?? 0),
      0
    );

    return {
      needsReturn,
      identified,
      totalPhotos: observations.length + extraPhotos,
      latest: sortedObservations[0]
    };
  }, [observations, sortedObservations]);

  const returnObservations = useMemo(
    () =>
      [...observations]
        .filter(
          (observation) =>
            observation.returnDate ||
            observation.collectionStatus === "return later" ||
            observation.collectionStatus === "not ready"
        )
        .sort((a, b) => getReturnSortTime(a) - getReturnSortTime(b)),
    [observations]
  );

  const filteredReturnObservations = useMemo(
    () =>
      returnObservations.filter((observation) => {
        const returnDate = observation.returnDate
          ? parseDateOnly(observation.returnDate)
          : undefined;
        const today = startOfDay(new Date());

        if (returnFilter === "all") {
          return true;
        }
        if (returnFilter === "upcoming") {
          return !!returnDate && returnDate >= today;
        }
        if (returnFilter === "overdue") {
          return !!returnDate && returnDate < today;
        }
        if (returnFilter === "ready now") {
          return observation.collectionStatus === "ready now";
        }
        return !returnDate;
      }),
    [returnFilter, returnObservations]
  );

  const cloudStats = useMemo(() => {
    const localOnly = observations.filter(
      (item) => (item.syncStatus ?? DEFAULT_SYNC_STATUS) === "local only"
    ).length;
    const pending = observations.filter(
      (item) => (item.syncStatus ?? DEFAULT_SYNC_STATUS) === "pending upload"
    ).length;
    const synced = observations.filter((item) => item.syncStatus === "synced").length;
    const failed = observations.filter(
      (item) => item.syncStatus === "sync failed"
    ).length;
    const privateCount = observations.filter(
      (item) => (item.privacyLevel ?? DEFAULT_PRIVACY_LEVEL) === "private"
    ).length;
    const shareCount = observations.filter(
      (item) => (item.privacyLevel ?? DEFAULT_PRIVACY_LEVEL) === "share with BCN"
    ).length;
    const publicCount = observations.filter(
      (item) =>
        (item.privacyLevel ?? DEFAULT_PRIVACY_LEVEL) === "public approximate"
    ).length;
    const extraPhotos = observations.reduce(
      (total, item) => total + (item.extraPhotos?.length ?? 0),
      0
    );

    return {
      localOnly,
      pending,
      synced,
      failed,
      privateCount,
      shareCount,
      publicCount,
      totalPhotos: observations.length + extraPhotos
    };
  }, [observations]);

  const selectedObservation = useMemo(
    () =>
      selectedObservationId
        ? observations.find((item) => item.id === selectedObservationId)
        : undefined,
    [observations, selectedObservationId]
  );

  const filteredSavedObservations = savedBaseObservations;

  const mapObservations = useMemo(() => {
    const today = startOfDay(new Date());
    const searchText = mapSearch.trim().toLowerCase();
    return observations.filter((observation) => {
      if (!hasValidCoordinates(observation)) {
        return false;
      }

      if (searchText && !getObservationSearchText(observation).includes(searchText)) {
        return false;
      }

      if (
        mapCollectionTypeFilter !== "all" &&
        !getCollectionTypes(observation).includes(mapCollectionTypeFilter)
      ) {
        return false;
      }

      if (mapStatusFilter === "need return") {
        if (!isNeedReturnObservation(observation, today)) {
          return false;
        }
      } else if (mapStatusFilter === "archived") {
        if (observation.collectionStatus !== "do not collect") {
          return false;
        }
      } else if (
        mapStatusFilter !== "all" &&
        observation.collectionStatus !== mapStatusFilter
      ) {
        return false;
      }

      if (mapReturnReadyOnly && !isNeedReturnObservation(observation, today)) {
        return false;
      }

      if (mapFavoritesOnly) {
        return observation.favorite === true;
      }

      if (
        mapNearbyOnly &&
        currentLocation &&
        getDistanceMeters(currentLocation.coords, observation) > 1609.344
      ) {
        return false;
      }

      return true;
    });
  }, [
    mapCollectionTypeFilter,
    currentLocation,
    mapFavoritesOnly,
    mapNearbyOnly,
    mapReturnReadyOnly,
    mapSearch,
    mapStatusFilter,
    observations
  ]);

  const mapDisplayItems = useMemo(
    () => getMapDisplayItems(mapObservations, mapRegion),
    [mapObservations, mapRegion]
  );

  const sortedMapObservations = useMemo(
    () =>
      [...mapObservations].sort((a, b) => {
        if (currentLocation) {
          return (
            getDistanceMeters(currentLocation.coords, a) -
              getDistanceMeters(currentLocation.coords, b) ||
            getObservedTime(b) - getObservedTime(a)
          );
        }
        return getObservedTime(b) - getObservedTime(a);
      }),
    [currentLocation, mapObservations]
  );

  const selectedMapObservation = useMemo(
    () =>
      selectedMapObservationId
        ? observations.find((item) => item.id === selectedMapObservationId)
        : undefined,
    [observations, selectedMapObservationId]
  );

  const activeMapRegion =
    mapRegion ?? createDatasetRegion(observations) ?? createRegion(40.254, -74.038, 0.08);

  async function loadObservations() {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      setObservations(JSON.parse(stored));
    } catch {
      Alert.alert("Storage error", "Saved observations could not be loaded.");
    }
  }

  async function persistObservations(next: PlantObservation[]) {
    setObservations(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function launchPhotoPicker(source: "camera" | "library") {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        source === "camera"
          ? "Camera permission is needed to take plant photos."
          : "Photo library permission is needed to select plant photos."
      );
      return;
    }

    return source === "camera"
      ? ImagePicker.launchCameraAsync({
          quality: 0.9,
          allowsEditing: false
        })
      : ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.9
        });
  }

  async function pickPhoto(source: "camera" | "library") {
    const result = await launchPhotoPicker(source);

    if (result && !result.canceled) {
      const selectedPhoto = result.assets[0];
      setPhoto(selectedPhoto);
      setPlantSuggestions([]);
      identifyPlant(selectedPhoto, { silent: true });
    }
  }

  async function captureLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Location permission is needed to make each observation mappable."
      );
      return null;
    }

    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High
    });
    setLocation(current);
    return current;
  }

  async function identifyPlant(
    photoToIdentify = photo,
    options: { silent?: boolean } = {}
  ) {
    if (!photoToIdentify) {
      if (!options.silent) {
        Alert.alert("Photo required", "Take or select a plant photo first.");
      }
      return;
    }

    if (!PLANTNET_API_KEY) {
      setDraft({
        ...draft,
        identificationStatus: "needs ID",
        identificationError: "Pl@ntNet API key not configured"
      });
      if (!options.silent) {
        Alert.alert(
          "API key needed",
          "Add a Pl@ntNet API key as EXPO_PUBLIC_PLANTNET_API_KEY to identify plants from photos."
        );
      }
      return;
    }

    setIsIdentifying(true);

    try {
      const formData = new FormData();
      formData.append("images", {
        uri: photoToIdentify.uri,
        name: getFileName(photoToIdentify.uri),
        type: "image/jpeg"
      } as unknown as Blob);
      formData.append("organs", "auto");

      const response = await fetch(
        `${PLANTNET_ENDPOINT}?api-key=${encodeURIComponent(PLANTNET_API_KEY)}`,
        {
          method: "POST",
          body: formData,
          headers: {
            Accept: "application/json"
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Plant ID request failed (${response.status})`);
      }

      const payload = await response.json();
      const suggestions = parsePlantSuggestions(payload).slice(0, 5);
      const best = suggestions[0];
      const commonName = best?.commonName ?? "";
      const otherNames = best?.otherNames ?? [];
      const scientificName = best?.scientificName ?? "";
      const confidenceScore = best?.confidenceScore;

      if (!commonName && !scientificName) {
        throw new Error("No plant match was returned.");
      }

      setPlantSuggestions(suggestions);
      setDraft({
        ...draft,
        commonName: commonName || draft.commonName,
        scientificName: scientificName || draft.scientificName,
        otherNames,
        confidenceScore,
        identificationStatus: "suggested",
        identificationError: undefined,
        identifiedAt: new Date().toISOString(),
        userConfirmed: false
      });
    } catch (error) {
      setDraft({
        ...draft,
        identificationStatus: "failed",
        identificationError: getErrorMessage(error)
      });
      if (!options.silent) {
        Alert.alert("Identification failed", getErrorMessage(error));
      }
    } finally {
      setIsIdentifying(false);
    }
  }

  function applyPlantSuggestion(suggestion: PlantSuggestion, confirmed: boolean) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      commonName: suggestion.commonName || currentDraft.commonName,
      scientificName: suggestion.scientificName || currentDraft.scientificName,
      otherNames: suggestion.otherNames,
      confidenceScore: suggestion.confidenceScore,
      identificationStatus: "suggested",
      identificationError: undefined,
      identifiedAt: new Date().toISOString(),
      userConfirmed: confirmed
    }));
  }

  async function saveObservation() {
    if (!photo) {
      Alert.alert("Photo required", "Take or select a plant photo first.");
      return;
    }

    if (!draft.commonName.trim()) {
      Alert.alert("Name required", "Enter a common name, even if it is tentative.");
      return;
    }

    setIsSaving(true);

    try {
      const observationLocation = location ?? (await captureLocation());
      if (!observationLocation) {
        return;
      }

      const existingObservation = editingObservationId
        ? observations.find((item) => item.id === editingObservationId)
        : undefined;

      if (existingObservation?.reminderNotificationId) {
        await Notifications.cancelScheduledNotificationAsync(
          existingObservation.reminderNotificationId
        );
      }

      const reminder = await scheduleReturnReminder(
        draft.commonName.trim(),
        draft.returnDate.trim(),
        draft.reminderLeadDays
      );
      const now = new Date().toISOString();
      const observationId = existingObservation?.id ?? createObservationId();
      const primaryPhotoFileName = getFileName(photo.uri);
      const ownerId = existingObservation?.ownerId ?? authUserId ?? LOCAL_OWNER_ID;

      const observation: PlantObservation = {
        id: observationId,
        cloudId: existingObservation?.cloudId,
        ownerId,
        privacyLevel: draft.privacyLevel,
        syncStatus: "pending upload",
        syncError: undefined,
        lastSyncedAt: existingObservation?.lastSyncedAt,
        createdAt: existingObservation?.createdAt ?? now,
        updatedAt: now,
        commonName: draft.commonName.trim(),
        scientificName: draft.scientificName.trim() || undefined,
        otherNames: draft.otherNames.length > 0 ? draft.otherNames : undefined,
        confidenceScore: draft.confidenceScore,
        identificationStatus: draft.identificationStatus ?? "manual",
        identificationError: draft.identificationError,
        identifiedAt: draft.identifiedAt,
        userConfirmed: draft.userConfirmed,
        photoUri: photo.uri,
        photoFileName: primaryPhotoFileName,
        photoStoragePath: createPhotoStoragePath(
          ownerId,
          observationId,
          "primary",
          primaryPhotoFileName
        ),
        extraPhotos: existingObservation?.extraPhotos,
        latitude: observationLocation.coords.latitude,
        longitude: observationLocation.coords.longitude,
        accuracyMeters: observationLocation.coords.accuracy ?? undefined,
        observedAt: existingObservation?.observedAt ?? now,
        notes: draft.notes.trim() || undefined,
        returnDate: draft.returnDate.trim() || undefined,
        reminderLeadDays: draft.returnDate.trim() ? draft.reminderLeadDays : undefined,
        reminderScheduledFor: reminder?.scheduledFor,
        reminderNotificationId: reminder?.notificationId,
        gatherNotes: draft.gatherNotes.trim() || undefined,
        collectionStatus: draft.collectionStatus,
        collectionType: draft.collectionTypes[0],
        collectionTypes: draft.collectionTypes,
        favorite: draft.favorite,
        tags: parseTags(draft.tagsText)
      };

      const nextObservations = editingObservationId
        ? observations.map((item) =>
            item.id === editingObservationId ? observation : item
          )
        : [observation, ...observations];

      await persistObservations(nextObservations);
      setDraft(blankDraft);
      setPhoto(null);
      setLocation(null);
      setEditingObservationId(null);
      setScreen("saved");
    } catch (error) {
      Alert.alert("Save failed", getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function editObservation(observation: PlantObservation) {
    setEditingObservationId(observation.id);
    setDraft({
      commonName: observation.commonName,
      scientificName: observation.scientificName ?? "",
      otherNames: observation.otherNames ?? [],
      notes: observation.notes ?? "",
      returnDate: observation.returnDate ?? "",
      reminderLeadDays: observation.reminderLeadDays ?? 3,
      gatherNotes: observation.gatherNotes ?? "",
      confidenceScore: observation.confidenceScore,
      identificationStatus: observation.identificationStatus,
      identificationError: observation.identificationError,
      identifiedAt: observation.identifiedAt,
      userConfirmed: observation.userConfirmed,
      collectionStatus: observation.collectionStatus ?? "return later",
      collectionTypes:
        observation.collectionTypes ??
        (observation.collectionType ? [observation.collectionType] : ["seeds"]),
      privacyLevel: observation.privacyLevel ?? DEFAULT_PRIVACY_LEVEL,
      favorite: observation.favorite ?? false,
      tagsText: (observation.tags ?? []).join(", ")
    });
    setPhoto({
      uri: observation.photoUri,
      width: 0,
      height: 0
    });
    setLocation({
      coords: {
        latitude: observation.latitude,
        longitude: observation.longitude,
        altitude: null,
        accuracy: observation.accuracyMeters ?? null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      },
      timestamp: new Date(observation.observedAt).getTime()
    });
    setScreen("new");
  }

  function cancelEditing() {
    setEditingObservationId(null);
    setDraft(blankDraft);
    setPhoto(null);
    setLocation(null);
  }

  async function scheduleReturnReminder(
    commonName: string,
    returnDate: string,
    leadDays: ReminderLeadDays
  ) {
    if (!returnDate) {
      return undefined;
    }

    const parsedReturnDate = parseDateOnly(returnDate);
    if (!parsedReturnDate) {
      return undefined;
    }

    const scheduledFor = new Date(parsedReturnDate);
    scheduledFor.setDate(scheduledFor.getDate() - leadDays);
    scheduledFor.setHours(9, 0, 0, 0);

    if (scheduledFor.getTime() <= Date.now()) {
      return undefined;
    }

    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      return undefined;
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Return to ${commonName}`,
        body: `${leadDays}-day heads-up: return date is ${returnDate}. Check gather notes in BCN Plant Scout.`,
        data: { returnDate, commonName }
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: scheduledFor
      }
    });

    return {
      notificationId,
      scheduledFor: scheduledFor.toISOString()
    };
  }

  async function deleteObservation(id: string) {
    const observation = observations.find((item) => item.id === id);
    if (!observation) {
      return;
    }

    Alert.alert(
      "Delete saved plant?",
      `Delete ${observation.commonName}? This removes the local record and any scheduled return reminder.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (observation.reminderNotificationId) {
              await Notifications.cancelScheduledNotificationAsync(
                observation.reminderNotificationId
              );
            }
            await persistObservations(observations.filter((item) => item.id !== id));
          }
        }
      ]
    );
  }

  async function shareObservationPhoto(observation: PlantObservation) {
    await sharePhotoUri(
      observation.photoUri,
      `Share ${observation.commonName} photo`
    );
  }

  async function sharePhotoUri(photoUri: string, dialogTitle: string) {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", photoUri);
        return;
      }

      await Sharing.shareAsync(photoUri, {
        mimeType: "image/jpeg",
        dialogTitle
      });
    } catch (error) {
      Alert.alert("Photo export failed", getErrorMessage(error));
    }
  }

  function addPhotoToObservation(observation: PlantObservation) {
    Alert.alert("Add plant photo", "Add another picture to this saved plant.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Take Photo",
        onPress: () => attachExtraPhoto(observation.id, "camera")
      },
      {
        text: "Select Photo",
        onPress: () => attachExtraPhoto(observation.id, "library")
      }
    ]);
  }

  async function attachExtraPhoto(id: string, source: "camera" | "library") {
    const result = await launchPhotoPicker(source);
    if (!result || result.canceled) {
      return;
    }

    const selectedPhoto = result.assets[0];
    const next = observations.map((observation) => {
      if (observation.id !== id) {
        return observation;
      }

      const extraPhotos = observation.extraPhotos ?? [];
      const extraPhotoId = createPhotoId();
      const fileName = getFileName(selectedPhoto.uri);
      return {
        ...observation,
        syncStatus: "pending upload" as SyncStatus,
        updatedAt: new Date().toISOString(),
        extraPhotos: [
          ...extraPhotos,
          {
            id: extraPhotoId,
            uri: selectedPhoto.uri,
            fileName,
            storagePath: createPhotoStoragePath(
              observation.ownerId ?? LOCAL_OWNER_ID,
              observation.id,
              `extra-${extraPhotos.length + 1}`,
              fileName
            ),
            addedAt: new Date().toISOString(),
            syncStatus: "pending upload" as SyncStatus
          }
        ]
      };
    });

    await persistObservations(next);
  }

  async function deleteExtraPhoto(id: string, photoIdOrUri: string) {
    const next = observations.map((observation) => {
      if (observation.id !== id) {
        return observation;
      }

      return {
        ...observation,
        extraPhotos: (observation.extraPhotos ?? []).filter(
          (photoItem) => (photoItem.id ?? photoItem.uri) !== photoIdOrUri
        ),
        syncStatus: "pending upload" as SyncStatus,
        updatedAt: new Date().toISOString()
      };
    });

    await persistObservations(next);
  }

  async function makeExtraPhotoPrimary(id: string, photoIdOrUri: string) {
    const next = observations.map((observation) => {
      if (observation.id !== id) {
        return observation;
      }

      const extraPhotos = observation.extraPhotos ?? [];
      const selectedPhoto = extraPhotos.find(
        (photoItem) => (photoItem.id ?? photoItem.uri) === photoIdOrUri
      );

      if (!selectedPhoto) {
        return observation;
      }

      const previousPrimary: ObservationPhoto = {
        id: createPhotoId(),
        uri: observation.photoUri,
        fileName: observation.photoFileName,
        storagePath: observation.photoStoragePath,
        addedAt: new Date().toISOString(),
        syncStatus: "pending upload"
      };

      return {
        ...observation,
        photoUri: selectedPhoto.uri,
        photoFileName: selectedPhoto.fileName ?? getFileName(selectedPhoto.uri),
        photoStoragePath: selectedPhoto.storagePath,
        extraPhotos: [
          previousPrimary,
          ...extraPhotos.filter(
            (photoItem) => (photoItem.id ?? photoItem.uri) !== photoIdOrUri
          )
        ],
        syncStatus: "pending upload" as SyncStatus,
        updatedAt: new Date().toISOString()
      };
    });

    await persistObservations(next);
  }

  async function openObservationMap(observation: PlantObservation) {
    const query = `${observation.latitude},${observation.longitude}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      query
    )}`;
    await Linking.openURL(url);
  }

  async function exportCsv() {
    if (observations.length === 0) {
      Alert.alert("Nothing to export", "Save at least one observation first.");
      return;
    }

    try {
      const csv = toCsv(observations);
      const fileName = `bcn-plant-observations-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.csv`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "text/csv",
          dialogTitle: "Export BCN plant observations"
        });
      } else {
        Alert.alert("CSV exported", fileUri);
      }
    } catch (error) {
      Alert.alert("Export failed", getErrorMessage(error));
    }
  }

  async function exportGeoJson() {
    if (observations.length === 0) {
      Alert.alert("Nothing to export", "Save at least one observation first.");
      return;
    }

    try {
      const geoJson = toGeoJson(observations);
      const fileName = `bcn-plant-observations-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.geojson`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, geoJson, {
        encoding: FileSystem.EncodingType.UTF8
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/geo+json",
          dialogTitle: "Export BCN plant observations"
        });
      } else {
        Alert.alert("GeoJSON exported", fileUri);
      }
    } catch (error) {
      Alert.alert("Export failed", getErrorMessage(error));
    }
  }

  async function exportPhotoPackage() {
    if (observations.length === 0) {
      Alert.alert("Nothing to export", "Save at least one observation first.");
      return;
    }

    try {
      const packageStamp = new Date().toISOString().replace(/[:.]/g, "-");
      const zip = new JSZip();
      const photosFolder = zip.folder("photos");

      const packagedRows = await Promise.all(
        observations.map(async (observation, index) => {
          const extension = getFileExtension(observation.photoFileName ?? observation.photoUri);
          const safeName = toSafeFileName(observation.commonName || "plant");
          const packagePhotoFileName = `${String(index + 1).padStart(
            3,
            "0"
          )}-${safeName}-${observation.id}.${extension}`;
          const photoBase64 = await FileSystem.readAsStringAsync(observation.photoUri, {
            encoding: FileSystem.EncodingType.Base64
          });

          photosFolder?.file(packagePhotoFileName, photoBase64, { base64: true });

          const packagedExtraPhotos = await Promise.all(
            (observation.extraPhotos ?? []).map(async (extraPhoto, extraIndex) => {
              const extraExtension = getFileExtension(
                extraPhoto.fileName ?? extraPhoto.uri
              );
              const extraPhotoFileName = `${String(index + 1).padStart(
                3,
                "0"
              )}-${safeName}-${observation.id}-extra-${extraIndex + 1}.${extraExtension}`;
              const extraBase64 = await FileSystem.readAsStringAsync(extraPhoto.uri, {
                encoding: FileSystem.EncodingType.Base64
              });

              photosFolder?.file(extraPhotoFileName, extraBase64, { base64: true });

              return {
                ...extraPhoto,
                uri: `photos/${extraPhotoFileName}`,
                fileName: extraPhotoFileName,
                storagePath:
                  extraPhoto.storagePath ??
                  createPhotoStoragePath(
                    observation.ownerId ?? LOCAL_OWNER_ID,
                    observation.id,
                    `extra-${extraIndex + 1}`,
                    extraPhotoFileName
                  )
              };
            })
          );

          return {
            ...observation,
            photoUri: `photos/${packagePhotoFileName}`,
            photoFileName: packagePhotoFileName,
            photoStoragePath:
              observation.photoStoragePath ??
              createPhotoStoragePath(
                observation.ownerId ?? LOCAL_OWNER_ID,
                observation.id,
                "primary",
                packagePhotoFileName
              ),
            extraPhotos: packagedExtraPhotos
          };
        })
      );

      zip.file("bcn-plant-observations.csv", toCsv(packagedRows));
      zip.file("bcn-plant-observations.geojson", toGeoJson(packagedRows));
      zip.file(
        "README.txt",
        [
          "BCN Plant Scout Export Package",
          "",
          "Contents:",
          "- bcn-plant-observations.csv",
          "- bcn-plant-observations.geojson",
          "- photos/",
          "",
          "GeoJSON coordinates are longitude, latitude.",
          "Photo URI fields point to the matching files in the photos folder."
        ].join("\n")
      );

      const zipBase64 = await zip.generateAsync({
        type: "base64",
        compression: "DEFLATE"
      });
      const zipUri = `${FileSystem.documentDirectory}bcn-plant-package-${packageStamp}.zip`;

      await FileSystem.writeAsStringAsync(zipUri, zipBase64, {
        encoding: FileSystem.EncodingType.Base64
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(zipUri, {
          mimeType: "application/zip",
          dialogTitle: "Share BCN plant export package"
        });
      } else {
        Alert.alert("Export package created", zipUri);
      }
    } catch (error) {
      Alert.alert("Package export failed", getErrorMessage(error));
    }
  }

  function navigate(nextScreen: AppScreen) {
    if (nextScreen === "new" && !editingObservationId) {
      startNewObservation();
      return;
    }
    setScreen(nextScreen);
    setMenuOpen(false);
  }

  async function startNewObservation() {
    setDraft(blankDraft);
    setPhoto(null);
    setLocation(null);
    setPlantSuggestions([]);
    setEditingObservationId(null);
    setShowAdvancedOptions(false);
    setMenuOpen(false);
    setScreen("new");
    pickPhoto("camera");
  }

  function openObservationDetail(observation: PlantObservation) {
    setSelectedObservationId(observation.id);
    setScreen("detail");
  }

  async function initializeMapRegion() {
    const latestLocation = await captureLocation();
    if (latestLocation) {
      setCurrentLocation(latestLocation);
      moveMapToRegion(
        createRegion(
          latestLocation.coords.latitude,
          latestLocation.coords.longitude,
          0.035
        )
      );
      return;
    }

    const datasetRegion = createDatasetRegion(observations);
    if (datasetRegion) {
      moveMapToRegion(datasetRegion);
    }
  }

  async function centerMapOnUser() {
    const latestLocation = await captureLocation();
    if (!latestLocation) {
      Alert.alert(
        "Location unavailable",
        "Saved plant pins are still available. Turn on location permission to center the map on you."
      );
      return;
    }

    setCurrentLocation(latestLocation);
    moveMapToRegion(
      createRegion(
        latestLocation.coords.latitude,
        latestLocation.coords.longitude,
        0.025
      )
    );
  }

  function refreshMapView() {
    const datasetRegion = createDatasetRegion(mapObservations);
    if (datasetRegion) {
      moveMapToRegion(datasetRegion);
      return;
    }
    initializeMapRegion();
  }

  function moveMapToRegion(nextRegion: Region) {
    setMapRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 350);
  }

  function zoomMap(multiplier: number) {
    if (!mapRegion) {
      return;
    }
    moveMapToRegion({
      ...mapRegion,
      latitudeDelta: Math.max(0.001, Math.min(80, mapRegion.latitudeDelta * multiplier)),
      longitudeDelta: Math.max(
        0.001,
        Math.min(80, mapRegion.longitudeDelta * multiplier)
      )
    });
  }

  function focusMapOnObservation(observation: PlantObservation) {
    setSelectedMapObservationId(observation.id);
    moveMapToRegion(
      createRegion(
        observation.latitude,
        observation.longitude,
        Math.min(mapRegion?.latitudeDelta ?? 0.01, 0.01)
      )
    );
  }

  function focusNearestMappedPlant() {
    const nearest = sortedMapObservations[0];
    if (!nearest) {
      Alert.alert("No mapped plants", "No saved plant locations match this map view.");
      return;
    }
    focusMapOnObservation(nearest);
  }

  async function updateObservationStatus(
    observation: PlantObservation,
    collectionStatus: CollectionStatus
  ) {
    const now = new Date().toISOString();
    const next = observations.map((item) =>
      item.id === observation.id
        ? {
            ...item,
            collectionStatus,
            syncStatus: "pending upload" as SyncStatus,
            syncError: undefined,
            updatedAt: now
          }
        : item
    );
    await persistObservations(next);
  }

  async function snoozeReturnDate(observation: PlantObservation, days: number) {
    const nextReturnDate = formatDateForInput(addDays(new Date(), days));
    const now = new Date().toISOString();
    const next = observations.map((item) =>
      item.id === observation.id
        ? {
            ...item,
            returnDate: nextReturnDate,
            collectionStatus: "return later" as CollectionStatus,
            syncStatus: "pending upload" as SyncStatus,
            syncError: undefined,
            updatedAt: now
          }
        : item
    );
    await persistObservations(next);
  }

  async function checkSupabaseConnection() {
    if (!supabase) {
      setSupabaseStatus("failed");
      setSupabaseMessage("Supabase URL or publishable key is missing.");
      return;
    }

    setSupabaseStatus("checking");
    setSupabaseMessage("Checking Supabase project...");

    try {
      const { error } = await supabase.from("observations").select("id").limit(1);
      if (error) {
        throw error;
      }

      setSupabaseStatus("reachable");
      setSupabaseMessage("Supabase project is reachable.");
    } catch (error) {
      setSupabaseStatus("failed");
      setSupabaseMessage(getErrorMessage(error));
    }
  }

  async function prepareLocalRecordsForUpload() {
    const now = new Date().toISOString();
    const nextObservations = observations.map((observation) => {
      const syncStatus = observation.syncStatus ?? DEFAULT_SYNC_STATUS;
      if (syncStatus !== "local only") {
        return observation;
      }

      return {
        ...observation,
        syncStatus: "pending upload" as SyncStatus,
        syncError: undefined,
        updatedAt: observation.updatedAt ?? now
      };
    });

    await persistObservations(nextObservations);
    setSupabaseStatus("configured");
    setSupabaseMessage("Local-only records are queued for upload.");
  }

  async function refreshCurrentLocationForSorting() {
    const latestLocation = await captureLocation();
    if (latestLocation) {
      setCurrentLocation(latestLocation);
      setSavedSort("distance");
    }
  }

  async function downloadCloudRecords() {
    if (!supabase) {
      setSupabaseStatus("failed");
      setSupabaseMessage("Supabase is not configured.");
      return;
    }

    if (!authUserId) {
      setSupabaseStatus("failed");
      setSupabaseMessage("Sign in before downloading cloud records.");
      setScreen("account");
      return;
    }

    setIsSyncing(true);
    setSupabaseStatus("checking");
    setSupabaseMessage("Downloading cloud records...");

    try {
      const { data, error } = await supabase
        .from("observations")
        .select("*")
        .order("observed_at", { ascending: false });

      if (error) {
        throw error;
      }

      const downloadedAt = new Date().toISOString();
      const cloudRecords = (data ?? []).map((row) =>
        fromSupabaseObservationRow(row, authUserId, downloadedAt)
      );
      const { merged, importedCount, updatedCount, conflictCount } =
        mergeCloudObservations(observations, cloudRecords);

      await persistObservations(merged);
      setSupabaseStatus("reachable");
      setSupabaseMessage(
        `Downloaded ${cloudRecords.length} cloud record(s). Imported ${importedCount}, updated ${updatedCount}, conflicts ${conflictCount}.`
      );
      setLastSyncResult({
        status: "success",
        records: cloudRecords.length,
        photos: 0,
        finishedAt: downloadedAt,
        message:
          conflictCount > 0
            ? "Download complete. Local unsynced edits were kept where conflicts were found."
            : "Download complete."
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setSupabaseStatus("failed");
      setSupabaseMessage(message);
      setLastSyncResult({
        status: "failed",
        records: 0,
        photos: 0,
        finishedAt: new Date().toISOString(),
        message
      });
    } finally {
      setIsSyncing(false);
    }
  }

  async function syncNow() {
    if (!authUserId) {
      setSupabaseStatus("failed");
      setSupabaseMessage("Sign in before syncing records.");
      setScreen("account");
      return;
    }
    await uploadPendingRecords();
    await downloadCloudRecords();
  }

  async function retryObservationPhotoUploads(observation: PlantObservation) {
    if (!supabase) {
      Alert.alert("Supabase not configured", "Cloud sync is not configured.");
      return;
    }
    if (!authUserId) {
      Alert.alert("Sign in needed", "Sign in before retrying photo uploads.");
      setScreen("account");
      return;
    }

    setIsSyncing(true);
    setSupabaseStatus("checking");
    setSupabaseMessage(`Retrying photos for ${observation.commonName}...`);

    try {
      const uploadedAt = new Date().toISOString();
      const uploadedObservation = await uploadObservationPhotos(
        observation,
        authUserId
      );
      const photoRows = toSupabasePhotoRows(uploadedObservation, authUserId);

      const { error: observationError } = await supabase
        .from("observations")
        .upsert(
          [toSupabaseObservationRow(uploadedObservation, authUserId, uploadedAt)],
          { onConflict: "id" }
        );
      if (observationError) {
        throw observationError;
      }

      const { error: photoError } = await supabase
        .from("observation_photos")
        .upsert(photoRows, { onConflict: "id" });
      if (photoError) {
        throw photoError;
      }

      const next = observations.map((item) =>
        item.id === observation.id
          ? {
              ...uploadedObservation,
              ownerId: authUserId,
              syncStatus: "synced" as SyncStatus,
              syncError: undefined,
              lastSyncedAt: uploadedAt
            }
          : item
      );

      await persistObservations(next);
      setSupabaseStatus("reachable");
      setSupabaseMessage(`Retried ${photoRows.length} photo upload(s).`);
    } catch (error) {
      const message = getErrorMessage(error);
      const next = observations.map((item) =>
        item.id === observation.id
          ? {
              ...item,
              syncStatus: "sync failed" as SyncStatus,
              syncError: message
            }
          : item
      );
      await persistObservations(next);
      setSupabaseStatus("failed");
      setSupabaseMessage(message);
      Alert.alert("Photo retry failed", message);
    } finally {
      setIsSyncing(false);
    }
  }

  async function signUpWithEmail() {
    if (!supabase) {
      setAuthMessage("Supabase is not configured.");
      return;
    }
    if (!accountEmail.trim() || !accountPassword) {
      setAuthMessage("Enter an email and password.");
      return;
    }

    setIsAuthLoading(true);
    setAuthMessage("Creating account...");

    try {
      const { error } = await supabase.auth.signUp({
        email: accountEmail.trim(),
        password: accountPassword
      });
      if (error) {
        throw error;
      }
      setAuthMessage("Account created. Check email if confirmation is required.");
    } catch (error) {
      setAuthMessage(getErrorMessage(error));
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function signInWithEmail() {
    if (!supabase) {
      setAuthMessage("Supabase is not configured.");
      return;
    }
    if (!accountEmail.trim() || !accountPassword) {
      setAuthMessage("Enter an email and password.");
      return;
    }

    setIsAuthLoading(true);
    setAuthMessage("Signing in...");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: accountEmail.trim(),
        password: accountPassword
      });
      if (error) {
        throw error;
      }
      setAuthMessage("Signed in.");
      setAccountPassword("");
    } catch (error) {
      setAuthMessage(getErrorMessage(error));
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function createSessionFromOAuthUrl(url: string) {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const { params, errorCode } = QueryParams.getQueryParams(url);

    if (errorCode) {
      throw new Error(errorCode);
    }

    if (params.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(
        String(params.code)
      );
      if (error) {
        throw error;
      }
      return;
    }

    if (params.access_token && params.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: String(params.access_token),
        refresh_token: String(params.refresh_token)
      });
      if (error) {
        throw error;
      }
      return;
    }

    throw new Error("Google sign-in did not return a session.");
  }

  async function signInWithGoogle() {
    if (!supabase) {
      setAuthMessage("Supabase is not configured.");
      return;
    }

    setIsAuthLoading(true);
    setAuthMessage("Opening Google sign-in...");

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: AUTH_REDIRECT_URL,
          skipBrowserRedirect: true
        }
      });

      if (error) {
        throw error;
      }
      if (!data?.url) {
        throw new Error("Google sign-in URL was not returned.");
      }

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        AUTH_REDIRECT_URL
      );

      if (result.type === "success") {
        await createSessionFromOAuthUrl(result.url);
        setAuthMessage("Signed in with Google.");
      } else if (result.type === "cancel") {
        setAuthMessage("Google sign-in was canceled.");
      } else {
        setAuthMessage("Google sign-in did not complete.");
      }
    } catch (error) {
      setAuthMessage(getErrorMessage(error));
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function signOut() {
    if (!supabase) {
      return;
    }

    setIsAuthLoading(true);
    setAuthMessage("Signing out...");

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      setAuthMessage("Signed out. New records will use local_user.");
      setAccountPassword("");
    } catch (error) {
      setAuthMessage(getErrorMessage(error));
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function sendPasswordResetEmail() {
    if (!supabase) {
      setAuthMessage("Supabase is not configured.");
      return;
    }
    if (!accountEmail.trim()) {
      setAuthMessage("Enter your email first.");
      return;
    }

    setIsAuthLoading(true);
    setAuthMessage("Sending password reset email...");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        accountEmail.trim()
      );
      if (error) {
        throw error;
      }
      setAuthMessage("Password reset email sent. Check your inbox.");
    } catch (error) {
      setAuthMessage(getErrorMessage(error));
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function openDeleteAccountPage() {
    await Linking.openURL(DELETE_ACCOUNT_URL);
  }

  function requestAccountDeletion() {
    const email = authUserEmail ?? accountEmail.trim() ?? "";
    Alert.alert(
      "Request account deletion",
      "This opens the BCN Plant Scout account deletion page. You can request cloud account and cloud record deletion there.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Open page",
          onPress: openDeleteAccountPage
        },
        {
          text: "Email request",
          onPress: () => {
            const subject = encodeURIComponent(
              "BCN Plant Scout Account Deletion Request"
            );
            const body = encodeURIComponent(
              `Please delete my BCN Plant Scout account and associated cloud data.\n\nAccount email: ${
                email || "(enter email)"
              }`
            );
            Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
          }
        }
      ]
    );
  }

  async function uploadPendingRecords() {
    if (!supabase) {
      setSupabaseStatus("failed");
      setSupabaseMessage("Supabase is not configured.");
      return;
    }

    if (!authUserId) {
      setSupabaseStatus("failed");
      setSupabaseMessage("Sign in before uploading records.");
      setScreen("account");
      return;
    }

    const pendingRecords = observations.filter((observation) => {
      const syncStatus = observation.syncStatus ?? DEFAULT_SYNC_STATUS;
      return syncStatus === "pending upload" || syncStatus === "sync failed";
    });

    if (pendingRecords.length === 0) {
      setSupabaseStatus("reachable");
      setSupabaseMessage("No pending records to upload.");
      return;
    }

    setIsSyncing(true);
    setSupabaseStatus("checking");
    setSupabaseMessage(`Uploading ${pendingRecords.length} record(s)...`);

    try {
      const uploadedAt = new Date().toISOString();
      const pendingPhotoCount = countObservationPhotos(pendingRecords);
      setSupabaseMessage(`Uploading photos for ${pendingRecords.length} record(s)...`);
      const recordsWithUploadedPhotos = await Promise.all(
        pendingRecords.map((observation) =>
          uploadObservationPhotos(observation, authUserId)
        )
      );

      const photoRows = recordsWithUploadedPhotos.flatMap((observation) =>
        toSupabasePhotoRows(observation, authUserId)
      );

      setSupabaseMessage(`Uploading ${pendingRecords.length} record(s)...`);
      const { error } = await supabase.from("observations").upsert(
        recordsWithUploadedPhotos.map((observation) =>
          toSupabaseObservationRow(observation, authUserId, uploadedAt)
        ),
        { onConflict: "id" }
      );

      if (error) {
        throw error;
      }

      if (photoRows.length > 0) {
        setSupabaseMessage(`Uploading metadata for ${photoRows.length} photo(s)...`);
        const { error: photoError } = await supabase
          .from("observation_photos")
          .upsert(photoRows, { onConflict: "id" });

        if (photoError) {
          throw photoError;
        }
      }

      const uploadedIds = new Set(pendingRecords.map((record) => record.id));
      const nextObservations = observations.map((observation) =>
        uploadedIds.has(observation.id)
          ? {
              ...(recordsWithUploadedPhotos.find(
                (uploaded) => uploaded.id === observation.id
              ) ?? observation),
              ownerId: authUserId,
              syncStatus: "synced" as SyncStatus,
              syncError: undefined,
              lastSyncedAt: uploadedAt,
              updatedAt: observation.updatedAt ?? uploadedAt
            }
          : observation
      );

      await persistObservations(nextObservations);
      setSupabaseStatus("reachable");
      setSupabaseMessage(
        `Uploaded ${pendingRecords.length} record(s) and ${pendingPhotoCount} photo(s).`
      );
      setLastSyncResult({
        status: "success",
        records: pendingRecords.length,
        photos: pendingPhotoCount,
        finishedAt: uploadedAt,
        message: "Upload complete."
      });
    } catch (error) {
      const message = getErrorMessage(error);
      const pendingIds = new Set(pendingRecords.map((record) => record.id));
      const nextObservations = observations.map((observation) =>
        pendingIds.has(observation.id)
          ? {
              ...observation,
              syncStatus: "sync failed" as SyncStatus,
              syncError: message,
              updatedAt: new Date().toISOString()
            }
          : observation
      );

      await persistObservations(nextObservations);
      setSupabaseStatus("failed");
      setSupabaseMessage(message);
      setLastSyncResult({
        status: "failed",
        records: pendingRecords.length,
        photos: countObservationPhotos(pendingRecords),
        finishedAt: new Date().toISOString(),
        message
      });
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.topBar}>
            <Pressable
              onPress={() => setMenuOpen((isOpen) => !isOpen)}
              style={styles.menuButton}
            >
              <Text style={styles.menuButtonText}>Menu</Text>
            </Pressable>
            <View style={styles.topBarText}>
              <Text style={styles.topBarTitle}>BCN Plant Scout</Text>
              <Text style={styles.topBarSubtitle}>{getScreenTitle(screen)}</Text>
            </View>
          </View>

          {menuOpen ? (
            <View style={styles.menu}>
              {menuItems.map((item) => (
                <Pressable
                  key={item.screen}
                  onPress={() => navigate(item.screen)}
                  style={[
                    styles.menuItem,
                    screen === item.screen && styles.menuItemActive
                  ]}
                >
                  <Text
                    style={[
                      styles.menuItemText,
                      screen === item.screen && styles.menuItemTextActive
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {screen === "home" ? (
            <View style={styles.cover}>
              <Image source={BCN_LOGO} style={styles.homeLogo} />
              <View style={styles.coverHero}>
                <Text style={styles.coverKicker}>Field collection for Base Camp North</Text>
                <Text style={styles.coverTitle}>BCN Plant Scout</Text>
                <Text style={styles.coverSubtitle}>
                  Capture photos, GPS points, seed sources, cuttings, and
                  return-later notes for your tree nursery work.
                </Text>
              </View>
              <View style={styles.coverStats}>
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{observations.length}</Text>
                  <Text style={styles.statLabel}>saved plants</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{homeStats.needsReturn}</Text>
                  <Text style={styles.statLabel}>returns soon</Text>
                </View>
              </View>
              <View style={styles.coverStats}>
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{homeStats.identified}</Text>
                  <Text style={styles.statLabel}>auto IDs</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{homeStats.totalPhotos}</Text>
                  <Text style={styles.statLabel}>photos</Text>
                </View>
              </View>
              {homeStats.latest ? (
                <View style={styles.homeLatest}>
                  <Text style={styles.homeLatestLabel}>Latest plant</Text>
                  <Text style={styles.homeLatestTitle}>
                    {homeStats.latest.commonName}
                  </Text>
                  <Text style={styles.homeLatestMeta}>
                    {formatDate(homeStats.latest.observedAt)} at{" "}
                    {formatTime(homeStats.latest.observedAt)}
                  </Text>
                </View>
              ) : null}
              <View style={styles.quickList}>
                <Text style={styles.quickListItem}>Photo records with location</Text>
                <Text style={styles.quickListItem}>Harvest and return notes</Text>
                <Text style={styles.quickListItem}>ZIP export for QGIS</Text>
              </View>
              <ActionButton
                label="New Plant"
                onPress={() => navigate("new")}
              />
              <ActionButton
                label="Saved Plants"
                onPress={() => navigate("saved")}
                variant="secondary"
              />
            </View>
          ) : null}

          {screen === "new" ? (
            <View style={styles.panel}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderText}>
                  <Text style={styles.sectionTitle}>
                    {editingObservationId ? "Edit Plant" : "New Plant Observation"}
                  </Text>
                  <Text style={styles.hintText}>
                    {editingObservationId
                      ? "Update names, return plans, collection interests, or status."
                      : "Photo, ID, GPS, and notes for one field record."}
                  </Text>
                </View>
                {editingObservationId ? (
                  <Pressable onPress={cancelEditing} style={styles.smallPillButton}>
                    <Text style={styles.smallPillButtonText}>Cancel</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.buttonRow}>
                <ActionButton
                  label={photo ? "Take Another Photo" : "Take Photo"}
                  onPress={() => pickPhoto("camera")}
                />
                <ActionButton
                  label="Select Photo"
                  onPress={() => pickPhoto("library")}
                  variant="secondary"
                />
              </View>

              {photo ? (
                <Image source={{ uri: photo.uri }} style={styles.previewImage} />
              ) : (
                <View style={styles.emptyPhoto}>
                  <Text style={styles.emptyPhotoText}>No plant photo selected</Text>
                </View>
              )}

              <GpsStatus location={location} />

              <ActionButton
                label={isIdentifying ? "Identifying..." : "Identify Plant"}
                onPress={identifyPlant}
                disabled={isIdentifying || !photo}
                variant="secondary"
              />

              {draft.identificationStatus ? (
                <View style={styles.identificationPanel}>
                  <Text style={styles.identificationLabel}>AI suggestion</Text>
                  {draft.commonName || draft.scientificName ? (
                    <Text style={styles.identificationText}>
                      {draft.commonName || draft.scientificName}
                      {draft.scientificName ? ` (${draft.scientificName})` : ""}
                    </Text>
                  ) : null}
                  {draft.confidenceScore !== undefined ? (
                    <Text style={styles.identificationText}>
                      Confidence: {draft.confidenceScore}%
                    </Text>
                  ) : null}
                  <View style={styles.buttonRow}>
                    <ActionButton
                      label="Accept ID"
                      onPress={() =>
                        plantSuggestions[0]
                          ? applyPlantSuggestion(plantSuggestions[0], true)
                          : setDraft({ ...draft, userConfirmed: true })
                      }
                      disabled={draft.identificationStatus !== "suggested"}
                    />
                    <ActionButton
                      label="Take Another Photo"
                      onPress={() => pickPhoto("camera")}
                      variant="secondary"
                    />
                  </View>
                  {plantSuggestions.length > 1 ? (
                    <View style={styles.suggestionList}>
                      <Text style={styles.nameSuggestionsLabel}>
                        Choose different species:
                      </Text>
                      {plantSuggestions.slice(1).map((suggestion) => (
                        <Pressable
                          key={`${suggestion.scientificName}-${suggestion.commonName}`}
                          onPress={() => applyPlantSuggestion(suggestion, true)}
                          style={styles.suggestionRow}
                        >
                          <Text style={styles.suggestionRowTitle}>
                            {suggestion.commonName || suggestion.scientificName}
                          </Text>
                          <Text style={styles.suggestionRowMeta}>
                            {suggestion.scientificName}
                            {suggestion.confidenceScore !== undefined
                              ? ` | ${suggestion.confidenceScore}%`
                              : ""}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {draft.identificationError ? (
                    <Text style={styles.identificationError}>
                      {draft.identificationError}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <Field
                label="Common name"
                value={draft.commonName}
                onChangeText={(commonName) => setDraft({ ...draft, commonName })}
                placeholder="Elderberry, chestnut, dogwood..."
              />
              {draft.otherNames.length > 0 ? (
                <NameSuggestions
                  names={draft.otherNames}
                  onSelect={(commonName) => setDraft({ ...draft, commonName })}
                />
              ) : null}
              <Field
                label="Scientific name"
                value={draft.scientificName}
                onChangeText={(scientificName) =>
                  setDraft({ ...draft, scientificName })
                }
                placeholder="Optional"
              />
              <Field
                label="Notes"
                value={draft.notes}
                onChangeText={(notes) => setDraft({ ...draft, notes })}
                placeholder="Return timing, harvest notes, access, habitat..."
                multiline
              />
              <View style={styles.field}>
                <Text style={styles.label}>Return date</Text>
                <Pressable
                  onPress={() => setShowReturnDatePicker(true)}
                  style={styles.datePickerButton}
                >
                  <Text style={styles.datePickerValue}>
                    {draft.returnDate || "Pick a return date"}
                  </Text>
                  <Text style={styles.datePickerHint}>
                    Tap to open calendar
                  </Text>
                </Pressable>
                <View style={styles.dateQuickActions}>
                  <Pressable
                    onPress={() =>
                      setDraft({
                        ...draft,
                        returnDate: formatDateForInput(addDays(new Date(), 7))
                      })
                    }
                    style={styles.dateQuickButton}
                  >
                    <Text style={styles.dateQuickButtonText}>+7 days</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      setDraft({
                        ...draft,
                        returnDate: formatDateForInput(addDays(new Date(), 30))
                      })
                    }
                    style={styles.dateQuickButton}
                  >
                    <Text style={styles.dateQuickButtonText}>+30 days</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setDraft({ ...draft, returnDate: "" })}
                    style={styles.dateQuickButton}
                  >
                    <Text style={styles.dateQuickButtonText}>Clear</Text>
                  </Pressable>
                </View>
                {showReturnDatePicker ? (
                  <DateTimePicker
                    value={parseDateOnly(draft.returnDate) ?? new Date()}
                    mode="date"
                    display={Platform.OS === "ios" ? "inline" : "calendar"}
                    onChange={(_, selectedDate) => {
                      if (Platform.OS !== "ios") {
                        setShowReturnDatePicker(false);
                      }
                      if (selectedDate) {
                        setDraft({
                          ...draft,
                          returnDate: formatDateForInput(selectedDate)
                        });
                      }
                    }}
                  />
                ) : null}
              </View>
              <Pressable
                onPress={() => setShowAdvancedOptions((isOpen) => !isOpen)}
                style={styles.advancedToggle}
              >
                <Text style={styles.advancedToggleText}>
                  {showAdvancedOptions ? "Hide Advanced Options" : "Advanced Options"}
                </Text>
              </Pressable>

              {showAdvancedOptions ? (
                <View style={styles.advancedPanel}>
                  <ChoiceGroup
                    label="Reminder heads-up"
                    options={[1, 3, 7] as ReminderLeadDays[]}
                    value={draft.reminderLeadDays}
                    onChange={(reminderLeadDays) =>
                      setDraft({ ...draft, reminderLeadDays })
                    }
                    formatOption={(days) => `${days} day${days === 1 ? "" : "s"}`}
                  />
                  <Field
                    label="Gather notes"
                    value={draft.gatherNotes}
                    onChangeText={(gatherNotes) =>
                      setDraft({ ...draft, gatherNotes })
                    }
                    placeholder="Seeds, cuttings, berries, access reminder..."
                    multiline
                  />
                  <Field
                    label="Tags"
                    value={draft.tagsText}
                    onChangeText={(tagsText) => setDraft({ ...draft, tagsText })}
                    placeholder="mother tree, wild source, nursery row..."
                  />
                  <Pressable
                    onPress={() =>
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        favorite: !currentDraft.favorite
                      }))
                    }
                    style={[
                      styles.favoriteToggle,
                      draft.favorite && styles.favoriteToggleActive
                    ]}
                  >
                    <Text
                      style={[
                        styles.favoriteToggleText,
                        draft.favorite && styles.favoriteToggleTextActive
                      ]}
                    >
                      {draft.favorite ? "Favorite plant" : "Mark as favorite"}
                    </Text>
                  </Pressable>
                  <MultiChoiceGroup
                    label="Collection interests"
                    options={collectionTypes}
                    values={draft.collectionTypes}
                    onChange={(collectionTypes) =>
                      setDraft({ ...draft, collectionTypes })
                    }
                  />
                  <ChoiceGroup
                    label="Collection status"
                    options={collectionStatuses}
                    value={draft.collectionStatus}
                    onChange={(collectionStatus) =>
                      setDraft({ ...draft, collectionStatus })
                    }
                  />
                  <ChoiceGroup
                    label="Privacy"
                    options={privacyLevels}
                    value={draft.privacyLevel}
                    onChange={(privacyLevel) =>
                      setDraft({ ...draft, privacyLevel })
                    }
                  />
                  {location ? (
                    <Text style={styles.locationText}>
                      GPS: {formatCoordinate(location.coords.latitude)},{" "}
                      {formatCoordinate(location.coords.longitude)} | Accuracy:{" "}
                      {location.coords.accuracy
                        ? `${Math.round(location.coords.accuracy)} m`
                        : "unknown"}
                    </Text>
                  ) : null}
                  <Text style={styles.helperText}>
                    Share with BCN is the default. Choose Private to keep a record
                    only on this phone.
                  </Text>
                </View>
              ) : null}

              <ActionButton
                label={
                  isSaving
                    ? "Saving..."
                    : editingObservationId
                    ? "Update Observation"
                    : "Save Observation"
                }
                onPress={saveObservation}
                disabled={isSaving}
              />
            </View>
          ) : null}

          {screen === "saved" ? (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>Saved Plants</Text>
                <Text style={styles.subtitle}>
                  {filteredSavedObservations.length} of {observations.length} field
                  record{observations.length === 1 ? "" : "s"} shown.
                </Text>
              </View>

              <View style={styles.filterRow}>
                {savedFilters.map((filter) => (
                  <Pressable
                    key={filter.value}
                    onPress={() => setSavedFilter(filter.value)}
                    style={[
                      styles.filterChip,
                      savedFilter === filter.value && styles.filterChipActive
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        savedFilter === filter.value && styles.filterChipTextActive
                      ]}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Field
                label="Search saved plants"
                value={savedSearch}
                onChangeText={setSavedSearch}
                placeholder="Name, notes, status, interest..."
              />

              <Text style={styles.label}>Collection type</Text>
              <View style={styles.filterRow}>
                <Pressable
                  onPress={() => setSavedCollectionTypeFilter("all")}
                  style={[
                    styles.filterChip,
                    savedCollectionTypeFilter === "all" && styles.filterChipActive
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      savedCollectionTypeFilter === "all" &&
                        styles.filterChipTextActive
                    ]}
                  >
                    All Types
                  </Text>
                </Pressable>
                {collectionTypes.map((collectionType) => (
                  <Pressable
                    key={collectionType}
                    onPress={() => setSavedCollectionTypeFilter(collectionType)}
                    style={[
                      styles.filterChip,
                      savedCollectionTypeFilter === collectionType &&
                        styles.filterChipActive
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        savedCollectionTypeFilter === collectionType &&
                          styles.filterChipTextActive
                      ]}
                    >
                      {collectionType}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Return date</Text>
              <View style={styles.filterRow}>
                {savedReturnFilters.map((filter) => (
                  <Pressable
                    key={filter.value}
                    onPress={() => setSavedReturnFilter(filter.value)}
                    style={[
                      styles.filterChip,
                      savedReturnFilter === filter.value && styles.filterChipActive
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        savedReturnFilter === filter.value &&
                          styles.filterChipTextActive
                      ]}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Sort</Text>
              <View style={styles.filterRow}>
                {savedSortOptions.map((sortOption) => (
                  <Pressable
                    key={sortOption.value}
                    onPress={() => setSavedSort(sortOption.value)}
                    style={[
                      styles.filterChip,
                      savedSort === sortOption.value && styles.filterChipActive
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        savedSort === sortOption.value &&
                          styles.filterChipTextActive
                      ]}
                    >
                      {sortOption.label}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={refreshCurrentLocationForSorting}
                  style={styles.filterChip}
                >
                  <Text style={styles.filterChipText}>Use GPS</Text>
                </Pressable>
              </View>

              {filteredSavedObservations.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateTitle}>No matching records</Text>
                  <Text style={styles.emptyStateText}>
                    Try another search, filter, or add a new plant record.
                  </Text>
                </View>
              ) : (
                filteredSavedObservations.map((observation) => (
                  <ObservationCard
                    key={observation.id}
                    observation={observation}
                    onOpenDetail={() => openObservationDetail(observation)}
                    onEdit={() => editObservation(observation)}
                    onAddPhoto={() => addPhotoToObservation(observation)}
                    onOpenMap={() => openObservationMap(observation)}
                    onSharePhoto={() => shareObservationPhoto(observation)}
                    onShareExtraPhoto={(photoItem) =>
                      sharePhotoUri(photoItem.uri, "Share extra photo")
                    }
                    onDeleteExtraPhoto={(photoItem) =>
                      deleteExtraPhoto(observation.id, photoItem.id ?? photoItem.uri)
                    }
                    onMakePrimary={(photoItem) =>
                      makeExtraPhotoPrimary(
                        observation.id,
                        photoItem.id ?? photoItem.uri
                      )
                    }
                    onRetryPhotos={() => retryObservationPhotoUploads(observation)}
                    onDelete={() => deleteObservation(observation.id)}
                  />
                ))
              )}
            </>
          ) : null}

          {screen === "map" ? (
            <View style={styles.mapPanel}>
              <View style={styles.header}>
                <Text style={styles.title}>Plant Map</Text>
                <Text style={styles.subtitle}>
                  {mapObservations.length} of {observations.length} saved plant
                  location{observations.length === 1 ? "" : "s"} shown.
                </Text>
                <Text style={styles.hintText}>
                  Field map preview: saved plant locations are shown in a fast
                  local list. Navigate opens Google Maps for any record.
                </Text>
              </View>

              <View style={styles.mapControls}>
                <Pressable onPress={centerMapOnUser} style={styles.mapControlButton}>
                  <Text style={styles.mapControlText}>My Location</Text>
                </Pressable>
                <Pressable
                  onPress={focusNearestMappedPlant}
                  style={styles.mapControlButton}
                >
                  <Text style={styles.mapControlText}>Nearest Plant</Text>
                </Pressable>
                <Pressable onPress={refreshMapView} style={styles.mapControlButton}>
                  <Text style={styles.mapControlText}>Fit Plants</Text>
                </Pressable>
                <Pressable
                  onPress={() => zoomMap(0.5)}
                  style={styles.mapControlButton}
                >
                  <Text style={styles.mapControlText}>Zoom In</Text>
                </Pressable>
                <Pressable
                  onPress={() => zoomMap(2)}
                  style={styles.mapControlButton}
                >
                  <Text style={styles.mapControlText}>Zoom Out</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    setMapType((current) =>
                      current === "standard" ? "satellite" : "standard"
                    )
                  }
                  style={styles.mapControlButton}
                >
                  <Text style={styles.mapControlText}>
                    {mapType === "standard" ? "Satellite" : "Standard"}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Status</Text>
              <Field
                label="Search map"
                value={mapSearch}
                onChangeText={setMapSearch}
                placeholder="Species, notes, tags, status..."
              />
              <View style={styles.filterRow}>
                {mapStatusFilters.map((filter) => (
                  <Pressable
                    key={filter.value}
                    onPress={() => setMapStatusFilter(filter.value)}
                    style={[
                      styles.filterChip,
                      mapStatusFilter === filter.value && styles.filterChipActive
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        mapStatusFilter === filter.value &&
                          styles.filterChipTextActive
                      ]}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Collection type</Text>
              <View style={styles.filterRow}>
                <Pressable
                  onPress={() => setMapCollectionTypeFilter("all")}
                  style={[
                    styles.filterChip,
                    mapCollectionTypeFilter === "all" && styles.filterChipActive
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      mapCollectionTypeFilter === "all" &&
                        styles.filterChipTextActive
                    ]}
                  >
                    All Types
                  </Text>
                </Pressable>
                {collectionTypes.map((collectionType) => (
                  <Pressable
                    key={collectionType}
                    onPress={() => setMapCollectionTypeFilter(collectionType)}
                    style={[
                      styles.filterChip,
                      mapCollectionTypeFilter === collectionType &&
                        styles.filterChipActive
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        mapCollectionTypeFilter === collectionType &&
                          styles.filterChipTextActive
                      ]}
                    >
                      {collectionType}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.filterRow}>
                <Pressable
                  onPress={() => setMapReturnReadyOnly((value) => !value)}
                  style={[
                    styles.filterChip,
                    mapReturnReadyOnly && styles.filterChipActive
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      mapReturnReadyOnly && styles.filterChipTextActive
                    ]}
                  >
                    Ready for Return
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMapFavoritesOnly((value) => !value)}
                  style={[
                    styles.filterChip,
                    mapFavoritesOnly && styles.filterChipActive
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      mapFavoritesOnly && styles.filterChipTextActive
                    ]}
                  >
                    Favorites
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMapNearbyOnly((value) => !value)}
                  style={[
                    styles.filterChip,
                    mapNearbyOnly && styles.filterChipActive
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      mapNearbyOnly && styles.filterChipTextActive
                    ]}
                  >
                    Within 1 mi
                  </Text>
                </Pressable>
              </View>
              {mapNearbyOnly && !currentLocation ? (
                <Text style={styles.hintText}>
                  Tap My Location to use the nearby filter.
                </Text>
              ) : null}
              <View style={styles.mapLegend}>
                {[
                  ["#1b7f3a", "ready"],
                  ["#c47a24", "return"],
                  ["#5b6f5b", "collected"],
                  ["#7a7a7a", "archived"],
                  ["#2f6f3e", "new"]
                ].map(([color, label]) => (
                  <View key={label} style={styles.mapLegendItem}>
                    <View style={[styles.mapLegendDot, { backgroundColor: color }]} />
                    <Text style={styles.mapLegendText}>{label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.mapFrame}>
                <MapView
                  ref={mapRef}
                  provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
                  style={styles.map}
                  region={activeMapRegion}
                  mapType={mapType}
                  showsUserLocation
                  showsMyLocationButton={false}
                  onRegionChangeComplete={setMapRegion}
                  onPress={() => setSelectedMapObservationId(null)}
                >
                  {mapDisplayItems.map((item) =>
                    item.observation ? (
                      <Marker
                        key={item.id}
                        coordinate={{
                          latitude: item.latitude,
                          longitude: item.longitude
                        }}
                        title={item.observation.commonName}
                        description={
                          item.observation.scientificName ||
                          item.observation.collectionStatus ||
                          "Plant observation"
                        }
                        onPress={(event) => {
                          event.stopPropagation();
                          if (item.observation) {
                            focusMapOnObservation(item.observation);
                          }
                        }}
                      >
                        <MapPin
                          color={getMapPinColor(item.observation)}
                          selected={selectedMapObservationId === item.observation.id}
                        />
                      </Marker>
                    ) : (
                      <Marker
                        key={item.id}
                        coordinate={{
                          latitude: item.latitude,
                          longitude: item.longitude
                        }}
                        title={`${item.count} nearby plants`}
                        description="Zoom in or filter to separate these records."
                      >
                        <ClusterMarker count={item.count} />
                      </Marker>
                    )
                  )}
                </MapView>
              </View>

              <Text style={styles.label}>
                {currentLocation ? "Nearest mapped plants" : "Mapped plants"}
              </Text>
              <View style={styles.mapList}>
                {mapObservations.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateTitle}>No mapped records</Text>
                    <Text style={styles.emptyStateText}>
                      Try another filter or add an observation with GPS.
                    </Text>
                  </View>
                ) : (
                  sortedMapObservations.slice(0, 80).map((observation) => (
                    <Pressable
                      key={observation.id}
                      onPress={() => focusMapOnObservation(observation)}
                      style={[
                        styles.mapListItem,
                        selectedMapObservationId === observation.id &&
                          styles.mapListItemActive
                      ]}
                    >
                      <View
                        style={[
                          styles.mapLegendDot,
                          { backgroundColor: getMapPinColor(observation) }
                        ]}
                      />
                      <View style={styles.mapListItemText}>
                        <Text style={styles.mapListTitle}>
                          {observation.commonName}
                        </Text>
                        <Text style={styles.mapListMeta}>
                          {formatCoordinate(observation.latitude)},{" "}
                          {formatCoordinate(observation.longitude)}
                          {currentLocation
                            ? ` | ${formatDistance(
                                getDistanceMeters(
                                  currentLocation.coords,
                                  observation
                                )
                              )}`
                            : ""}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                )}
              </View>
              {mapObservations.length > 80 ? (
                <Text style={styles.hintText}>
                  Showing first 80 matching records. Use search or filters to narrow
                  the list.
                </Text>
              ) : null}

              {selectedMapObservation ? (
                <MapObservationSummary
                  observation={selectedMapObservation}
                  currentLocation={currentLocation}
                  onViewDetails={() => openObservationDetail(selectedMapObservation)}
                  onNavigate={() => openObservationMap(selectedMapObservation)}
                  onEdit={() => editObservation(selectedMapObservation)}
                  onMarkReady={() =>
                    updateObservationStatus(selectedMapObservation, "ready now")
                  }
                  onMarkCollected={() =>
                    updateObservationStatus(selectedMapObservation, "collected")
                  }
                />
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateTitle}>Select a plant location</Text>
                  <Text style={styles.emptyStateText}>
                    Select a record to see the plant summary, route back to it, or
                    edit the observation.
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {screen === "detail" ? (
            selectedObservation ? (
              <ObservationDetail
                observation={selectedObservation}
                onBack={() => navigate("saved")}
                onEdit={() => editObservation(selectedObservation)}
                onOpenMap={() => openObservationMap(selectedObservation)}
                onAddPhoto={() => addPhotoToObservation(selectedObservation)}
                onSharePhoto={() => shareObservationPhoto(selectedObservation)}
                onShareExtraPhoto={(photoItem) =>
                  sharePhotoUri(photoItem.uri, "Share extra photo")
                }
                onDeleteExtraPhoto={(photoItem) =>
                  deleteExtraPhoto(
                    selectedObservation.id,
                    photoItem.id ?? photoItem.uri
                  )
                }
                onMakePrimary={(photoItem) =>
                  makeExtraPhotoPrimary(
                    selectedObservation.id,
                    photoItem.id ?? photoItem.uri
                  )
                }
              />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>Record not found</Text>
                <Text style={styles.emptyStateText}>
                  Go back to Saved Plants and select a record.
                </Text>
              </View>
            )
          ) : null}

          {screen === "returns" ? (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>Returns</Text>
                <Text style={styles.subtitle}>
                  Plants marked for follow-up, collection, or monitoring.
                </Text>
              </View>

              {returnObservations.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateTitle}>No return list yet</Text>
                  <Text style={styles.emptyStateText}>
                    Add a return date or mark a plant as return later/not ready.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.filterRow}>
                    {returnFilters.map((filter) => (
                      <Pressable
                        key={filter.value}
                        onPress={() => setReturnFilter(filter.value)}
                        style={[
                          styles.filterChip,
                          returnFilter === filter.value && styles.filterChipActive
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            returnFilter === filter.value &&
                              styles.filterChipTextActive
                          ]}
                        >
                          {filter.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {filteredReturnObservations.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyStateTitle}>No matching returns</Text>
                      <Text style={styles.emptyStateText}>
                        Try another return filter.
                      </Text>
                    </View>
                  ) : (
                    filteredReturnObservations.map((observation) => (
                      <ReturnCard
                        key={observation.id}
                        observation={observation}
                        onEdit={() => editObservation(observation)}
                        onOpenMap={() => openObservationMap(observation)}
                        onMarkReady={() =>
                          updateObservationStatus(observation, "ready now")
                        }
                        onMarkCollected={() =>
                          updateObservationStatus(observation, "collected")
                        }
                        onSnooze={() => snoozeReturnDate(observation, 7)}
                      />
                    ))
                  )}
                </>
              )}
            </>
          ) : null}

          {screen === "cloud" ? (
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Cloud Prep</Text>
              <Text style={styles.panelText}>
                Local records can sync to Supabase when you are signed in.
                Uploads include observation data, photo files, and photo metadata.
              </Text>
              <View style={styles.statGrid}>
                <StatTile label="records" value={`${observations.length}`} />
                <StatTile label="photos" value={`${cloudStats.totalPhotos}`} />
                <StatTile label="local only" value={`${cloudStats.localOnly}`} />
                <StatTile label="pending upload" value={`${cloudStats.pending}`} />
                <StatTile label="synced" value={`${cloudStats.synced}`} />
                <StatTile label="sync failed" value={`${cloudStats.failed}`} />
                <StatTile label="share with BCN" value={`${cloudStats.shareCount}`} />
                <StatTile label="private" value={`${cloudStats.privateCount}`} />
                <StatTile
                  label="public approx."
                  value={`${cloudStats.publicCount}`}
                />
              </View>
              <View style={styles.quickList}>
                <Text style={styles.quickListItem}>Backend: Supabase</Text>
                <Text style={styles.quickListItem}>
                  Photo storage: users/{formatShortId(authUserId)}/observations/
                </Text>
                <Text style={styles.quickListItem}>
                  Exact GPS stays controlled by privacy setting
                </Text>
              </View>
              <View style={styles.detailInfoBox}>
                <Text style={styles.detailInfoLabel}>1.0 readiness</Text>
                <Text style={styles.detailInfoText}>
                  {authUserId ? "Signed in" : "Sign in needed before upload"}
                </Text>
                <Text style={styles.hintText}>
                  {cloudStats.localOnly > 0
                    ? `${cloudStats.localOnly} local-only record(s) need to be queued.`
                    : "No local-only records."}
                </Text>
                <Text style={styles.hintText}>
                  {cloudStats.failed > 0
                    ? `${cloudStats.failed} failed record(s) ready to retry.`
                    : "No failed syncs."}
                </Text>
                <Text style={styles.hintText}>
                  {cloudStats.pending > 0
                    ? `${cloudStats.pending} pending record(s) waiting for upload.`
                    : "No pending uploads."}
                </Text>
                <Text style={styles.hintText}>
                  Last synced: {formatLastSyncedAt(getLatestSyncedAt(observations))}
                </Text>
              </View>
              <View style={styles.detailInfoBox}>
                <Text style={styles.detailInfoLabel}>Supabase connection</Text>
                <Text style={styles.detailInfoText}>
                  Status: {supabaseStatus}
                </Text>
                {supabaseMessage ? (
                  <Text style={styles.hintText}>{supabaseMessage}</Text>
                ) : null}
              </View>
              <ActionButton
                label={
                  supabaseStatus === "checking"
                    ? "Checking..."
                    : "Check Supabase Connection"
                }
                onPress={checkSupabaseConnection}
                disabled={supabaseStatus === "checking"}
              />
              {cloudStats.localOnly > 0 ? (
                <ActionButton
                  label="Prepare Local Records for Upload"
                  onPress={prepareLocalRecordsForUpload}
                  variant="secondary"
                />
              ) : null}
              <ActionButton
                label={isSyncing ? "Syncing..." : "Sync Now"}
                onPress={syncNow}
                disabled={isSyncing}
              />
              <ActionButton
                label={
                  isSyncing
                    ? "Syncing..."
                    : cloudStats.failed > 0
                      ? "Retry Failed Syncs"
                      : "Upload Pending Records"
                }
                onPress={uploadPendingRecords}
                disabled={isSyncing}
                variant="secondary"
              />
              <ActionButton
                label={isSyncing ? "Syncing..." : "Download Cloud Records"}
                onPress={downloadCloudRecords}
                disabled={isSyncing}
                variant="secondary"
              />
              <Text style={styles.hintText}>
                Upload sends observation records, photo files, and photo metadata.
                Download brings cloud records back to this phone and keeps unsynced
                local edits when there is a conflict.
              </Text>
              {lastSyncResult ? (
                <View style={styles.detailInfoBox}>
                  <Text style={styles.detailInfoLabel}>Last sync</Text>
                  <Text style={styles.detailInfoText}>
                    {lastSyncResult.status === "success" ? "Success" : "Failed"} at{" "}
                    {formatDate(lastSyncResult.finishedAt)}{" "}
                    {formatTime(lastSyncResult.finishedAt)}
                  </Text>
                  <Text style={styles.hintText}>
                    Records: {lastSyncResult.records} | Photos:{" "}
                    {lastSyncResult.photos}
                  </Text>
                  <Text style={styles.hintText}>{lastSyncResult.message}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {screen === "account" ? (
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Account</Text>
              <Text style={styles.panelText}>
                Sign in to upload and download field records, photo files, and
                photo metadata. If there is an account issue, use password reset or
                request account deletion from here.
              </Text>

              <View style={styles.detailInfoBox}>
                <Text style={styles.detailInfoLabel}>Current user</Text>
                <Text style={styles.detailInfoText}>
                  {authUserId ? "Signed in" : "Not signed in"}
                </Text>
                <Text style={styles.hintText}>
                  {authUserEmail ??
                    "Records stay local until you sign in and upload them."}
                </Text>
                <Text style={styles.hintText}>
                  Owner ID for new records: {authUserId ?? LOCAL_OWNER_ID}
                </Text>
              </View>

              {!authUserId ? (
                <>
                  <Field
                    label="Email"
                    value={accountEmail}
                    onChangeText={setAccountEmail}
                    placeholder="you@example.com"
                  />
                  <Field
                    label="Password"
                    value={accountPassword}
                    onChangeText={setAccountPassword}
                    placeholder="Password"
                    secureTextEntry
                  />
                </>
              ) : null}

              {authMessage ? (
                <View style={styles.identificationPanel}>
                  <Text style={styles.identificationText}>{authMessage}</Text>
                </View>
              ) : null}

              {authUserId ? (
                <ActionButton
                  label={isAuthLoading ? "Working..." : "Sign Out"}
                  onPress={signOut}
                  disabled={isAuthLoading}
                  variant="secondary"
                />
              ) : (
                <>
                  <ActionButton
                    label={isAuthLoading ? "Working..." : "Sign In with Google"}
                    onPress={signInWithGoogle}
                    disabled={isAuthLoading}
                    variant="secondary"
                  />
                  <ActionButton
                    label={isAuthLoading ? "Working..." : "Sign In"}
                    onPress={signInWithEmail}
                    disabled={isAuthLoading}
                  />
                  <ActionButton
                    label="Create Account"
                    onPress={signUpWithEmail}
                    disabled={isAuthLoading}
                    variant="secondary"
                  />
                </>
              )}
              <ActionButton
                label="Send Password Reset Email"
                onPress={sendPasswordResetEmail}
                disabled={isAuthLoading}
                variant="secondary"
              />
              <ActionButton
                label="Request Account Deletion"
                onPress={requestAccountDeletion}
                disabled={isAuthLoading}
                variant="secondary"
              />
              <Text style={styles.hintText}>
                Google sign-in and email sign-in both use Supabase Auth. Account
                deletion opens the BCN Plant Scout deletion request page or an
                email request.
              </Text>
            </View>
          ) : null}

          {screen === "export" ? (
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Export</Text>
              <Text style={styles.panelText}>
                Export all saved plant observations as a CSV file for QGIS, Excel,
                Google Sheets, or desktop archiving.
              </Text>
              <Text style={styles.hintText}>
                ZIP export packages records plus copied image files with matching
                names for GIS attachment workflows.
              </Text>
              <View style={styles.exportGrid}>
                <View style={styles.exportSummary}>
                  <Text style={styles.exportSummaryNumber}>{observations.length}</Text>
                  <Text style={styles.exportSummaryLabel}>records</Text>
                </View>
                <View style={styles.exportSummary}>
                  <Text style={styles.exportSummaryNumber}>CSV</Text>
                  <Text style={styles.exportSummaryLabel}>format</Text>
                </View>
              </View>
              <View style={styles.buttonRow}>
                <ActionButton label="Export CSV" onPress={exportCsv} />
                <ActionButton
                  label="Export GeoJSON"
                  onPress={exportGeoJson}
                  variant="secondary"
                />
              </View>
              <ActionButton
                label="Create ZIP Export Package"
                onPress={exportPhotoPackage}
                variant="secondary"
              />
              <Text style={styles.hintText}>
                The zip package includes CSV, GeoJSON, README, and a photos folder
                with matching filenames for GIS work.
              </Text>
            </View>
          ) : null}

          {screen === "about" ? (
            <View style={styles.panel}>
              <Image source={BCN_LOGO} style={styles.aboutLogo} />
              <Text style={styles.aboutKicker}>Base Camp North</Text>
              <Text style={styles.sectionTitle}>Resilience into roots</Text>
              <Text style={styles.panelText}>
                Base Camp North began as a backyard project during your time in
                emergency management. In that world, a base camp is a safe place
                where crews rest, recover, and prepare for what comes next.
              </Text>
              <Text style={styles.panelText}>
                That idea became the nursery: growth and renewal after the storm,
                starting with acorns, oak seedlings, and native plants.
              </Text>
              <Text style={styles.panelText}>
                Today BCN is a small Pennsylvania nursery focused on native trees,
                nut species, and pollinator plants. Many seeds are hand-collected
                from state forests, local parks, and historic trees throughout the
                Poconos, then cleaned, cold-stratified, and grown with sustainable
                soil blends and organic methods.
              </Text>
              <Text style={styles.panelText}>
                Reforestation begins one backyard at a time. Every seedling helps
                rebuild local ecosystems, support pollinators, and preserve native
                forests for future generations.
              </Text>
              <ActionButton
                label="Visit BCN Website"
                onPress={() =>
                  Linking.openURL("https://basecampnorth-pa.square.site/about-bcn")
                }
                variant="secondary"
              />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  multiline,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secureTextEntry?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        style={[styles.input, multiline && styles.multilineInput]}
        placeholderTextColor="#7a846f"
      />
    </View>
  );
}

function ChoiceGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  formatOption
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (value: T) => void;
  formatOption?: (value: T) => string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((option) => (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={[styles.chip, value === option && styles.chipSelected]}
          >
            <Text
              style={[
                styles.chipText,
                value === option && styles.chipTextSelected
              ]}
            >
              {formatOption ? formatOption(option) : option}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function MultiChoiceGroup<T extends string>({
  label,
  options,
  values,
  onChange
}: {
  label: string;
  options: T[];
  values: T[];
  onChange: (values: T[]) => void;
}) {
  function toggle(option: T) {
    if (values.includes(option)) {
      const nextValues = values.filter((value) => value !== option);
      onChange(nextValues.length > 0 ? nextValues : values);
      return;
    }

    onChange([...values, option]);
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.helperText}>Select one, several, or all that apply.</Text>
      <View style={styles.chipRow}>
        {options.map((option) => (
          <Pressable
            key={option}
            onPress={() => toggle(option)}
            style={[styles.chip, values.includes(option) && styles.chipSelected]}
          >
            <Text
              style={[
                styles.chipText,
                values.includes(option) && styles.chipTextSelected
              ]}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function NameSuggestions({
  names,
  onSelect
}: {
  names: string[];
  onSelect: (name: string) => void;
}) {
  return (
    <View style={styles.nameSuggestions}>
      <Text style={styles.nameSuggestionsLabel}>Also called - tap to use:</Text>
      <View style={styles.chipRow}>
        {names.map((name) => (
          <Pressable
            key={name}
            onPress={() => onSelect(name)}
            style={styles.suggestionChip}
          >
            <Text style={styles.suggestionChipText}>{name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function MapPin({ color, selected }: { color: string; selected: boolean }) {
  return (
    <View
      style={[
        styles.mapPin,
        { backgroundColor: color },
        selected && styles.mapPinSelected
      ]}
    >
      <View style={styles.mapPinCore} />
    </View>
  );
}

function ClusterMarker({ count }: { count: number }) {
  return (
    <View style={styles.clusterMarker}>
      <Text style={styles.clusterMarkerText}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  variant = "primary",
  disabled = false
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        variant === "secondary" && styles.secondaryButton,
        disabled && styles.disabledButton
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          variant === "secondary" && styles.secondaryButtonText
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function GpsStatus({ location }: { location: Location.LocationObject | null }) {
  const status = getGpsStatus(location);
  return (
    <View style={styles.gpsStatus}>
      <View style={[styles.gpsDot, { backgroundColor: status.color }]} />
      <Text style={styles.gpsStatusText}>{status.label}</Text>
    </View>
  );
}

function MapObservationSummary({
  observation,
  currentLocation,
  onViewDetails,
  onNavigate,
  onEdit,
  onMarkReady,
  onMarkCollected
}: {
  observation: PlantObservation;
  currentLocation: Location.LocationObject | null;
  onViewDetails: () => void;
  onNavigate: () => void;
  onEdit: () => void;
  onMarkReady: () => void;
  onMarkCollected: () => void;
}) {
  const distance =
    currentLocation && hasValidCoordinates(observation)
      ? formatDistance(getDistanceMeters(currentLocation.coords, observation))
      : undefined;

  return (
    <View style={styles.mapSummaryCard}>
      <Image source={{ uri: observation.photoUri }} style={styles.mapSummaryImage} />
      <View style={styles.mapSummaryBody}>
        <Text style={styles.cardTitle}>{observation.commonName}</Text>
        {observation.scientificName ? (
          <Text style={styles.scientificName}>{observation.scientificName}</Text>
        ) : null}
        {observation.favorite || observation.tags?.length ? (
          <Text style={styles.cardMeta}>
            {[
              observation.favorite ? "Favorite" : undefined,
              observation.tags?.length ? observation.tags.join(", ") : undefined
            ]
              .filter(Boolean)
              .join(" | ")}
          </Text>
        ) : null}
        <View style={styles.metaGrid}>
          <MetaChip label="Status" value={observation.collectionStatus ?? ""} />
          <MetaChip
            label="Interest"
            value={formatCollectionInterests(observation)}
          />
          <MetaChip label="Return" value={observation.returnDate ?? ""} />
          <MetaChip label="Distance" value={distance ?? ""} />
        </View>
        <View style={styles.cardActions}>
          <Pressable onPress={onMarkReady} style={styles.cardActionButton}>
            <Text style={styles.cardActionButtonText}>Ready</Text>
          </Pressable>
          <Pressable onPress={onMarkCollected} style={styles.cardActionButton}>
            <Text style={styles.cardActionButtonText}>Collected</Text>
          </Pressable>
          <Pressable onPress={onViewDetails} style={styles.cardActionButton}>
            <Text style={styles.cardActionButtonText}>View Details</Text>
          </Pressable>
          <Pressable onPress={onNavigate} style={styles.cardActionButton}>
            <Text style={styles.cardActionButtonText}>Navigate</Text>
          </Pressable>
          <Pressable onPress={onEdit} style={styles.cardActionButton}>
            <Text style={styles.cardActionButtonText}>Edit</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ObservationCard({
  observation,
  onOpenDetail,
  onEdit,
  onAddPhoto,
  onOpenMap,
  onSharePhoto,
  onShareExtraPhoto,
  onDeleteExtraPhoto,
  onMakePrimary,
  onRetryPhotos,
  onDelete
}: {
  observation: PlantObservation;
  onOpenDetail: () => void;
  onEdit: () => void;
  onAddPhoto: () => void;
  onOpenMap: () => void;
  onSharePhoto: () => void;
  onShareExtraPhoto: (photoItem: ObservationPhoto) => void;
  onDeleteExtraPhoto: (photoItem: ObservationPhoto) => void;
  onMakePrimary: (photoItem: ObservationPhoto) => void;
  onRetryPhotos: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable onPress={onOpenDetail}>
        <Image source={{ uri: observation.photoUri }} style={styles.cardImage} />
      </Pressable>
      <View style={styles.cardBody}>
        <Pressable onPress={onOpenDetail} style={styles.cardTitleRow}>
          <View style={styles.cardTitleText}>
            <Text style={styles.cardTitle}>{observation.commonName}</Text>
            {observation.scientificName ? (
              <Text style={styles.scientificName}>
                {observation.scientificName}
              </Text>
            ) : null}
          </View>
          {observation.confidenceScore !== undefined ? (
            <View style={styles.confidenceBadge}>
              <Text style={styles.confidenceBadgeText}>
                {observation.confidenceScore}%
              </Text>
            </View>
          ) : null}
        </Pressable>
        {observation.otherNames && observation.otherNames.length > 0 ? (
          <Text style={styles.cardMeta}>
            Also called: {observation.otherNames.join(", ")}
          </Text>
        ) : null}
        {observation.favorite ? (
          <Text style={styles.cardMeta}>Favorite plant</Text>
        ) : null}
        {observation.tags && observation.tags.length > 0 ? (
          <Text style={styles.cardMeta}>Tags: {observation.tags.join(", ")}</Text>
        ) : null}
        <View style={styles.metaGrid}>
          <MetaChip label="Date" value={formatDate(observation.observedAt)} />
          <MetaChip
            label="Accuracy"
            value={
              observation.accuracyMeters !== undefined
                ? `${formatMeters(observation.accuracyMeters)} m`
                : "unknown"
            }
          />
          <MetaChip label="Status" value={observation.collectionStatus ?? ""} />
          <MetaChip
            label="Interest"
            value={formatCollectionInterests(observation)}
          />
          <MetaChip
            label="Sync"
            value={observation.syncStatus ?? DEFAULT_SYNC_STATUS}
          />
          <MetaChip
            label="Privacy"
            value={observation.privacyLevel ?? DEFAULT_PRIVACY_LEVEL}
          />
        </View>
        {observation.returnDate ? (
          <Text style={styles.cardMeta}>Return: {observation.returnDate}</Text>
        ) : null}
        {observation.reminderScheduledFor ? (
          <Text style={styles.cardMeta}>
            Reminder: {formatDate(observation.reminderScheduledFor)} at{" "}
            {formatTime(observation.reminderScheduledFor)}
          </Text>
        ) : observation.returnDate ? (
          <Text style={styles.cardMeta}>
            Reminder: not scheduled. Use YYYY-MM-DD for alerts.
          </Text>
        ) : null}
        {observation.extraPhotos && observation.extraPhotos.length > 0 ? (
          <Text style={styles.cardMeta}>
            Extra photos: {observation.extraPhotos.length}
          </Text>
        ) : null}
        {observation.identificationStatus ? (
          <Text style={styles.cardMeta}>
            ID: {observation.identificationStatus}
            {observation.confidenceScore !== undefined
              ? ` | ${observation.confidenceScore}%`
              : ""}
          </Text>
        ) : null}
        {observation.syncStatus === "sync failed" && observation.syncError ? (
          <Text style={styles.errorText}>Sync error: {observation.syncError}</Text>
        ) : null}
        {observation.notes ? (
          <Text style={styles.cardNotes}>{observation.notes}</Text>
        ) : null}
        {observation.gatherNotes ? (
          <Text style={styles.cardNotes}>Gather: {observation.gatherNotes}</Text>
        ) : null}
        {observation.extraPhotos && observation.extraPhotos.length > 0 ? (
          <ExtraPhotoGallery
            photos={observation.extraPhotos}
            onShare={onShareExtraPhoto}
            onDelete={onDeleteExtraPhoto}
            onMakePrimary={onMakePrimary}
          />
        ) : null}
        <View style={styles.cardActions}>
          <Pressable onPress={onEdit} style={styles.cardActionButton}>
            <Text style={styles.cardActionButtonText}>Edit</Text>
          </Pressable>
          <Pressable onPress={onOpenMap} style={styles.cardActionButton}>
            <Text style={styles.cardActionButtonText}>Open Map</Text>
          </Pressable>
          <Pressable onPress={onAddPhoto} style={styles.cardActionButton}>
            <Text style={styles.cardActionButtonText}>Add Photo</Text>
          </Pressable>
          <Pressable onPress={onSharePhoto} style={styles.cardActionButton}>
            <Text style={styles.cardActionButtonText}>Share Photo</Text>
          </Pressable>
          {observation.syncStatus === "sync failed" ? (
            <Pressable onPress={onRetryPhotos} style={styles.cardActionButton}>
              <Text style={styles.cardActionButtonText}>Retry Photos</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onDelete} style={styles.deleteButton}>
            <Text style={styles.deleteButtonText}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ObservationDetail({
  observation,
  onBack,
  onEdit,
  onOpenMap,
  onAddPhoto,
  onSharePhoto,
  onShareExtraPhoto,
  onDeleteExtraPhoto,
  onMakePrimary
}: {
  observation: PlantObservation;
  onBack: () => void;
  onEdit: () => void;
  onOpenMap: () => void;
  onAddPhoto: () => void;
  onSharePhoto: () => void;
  onShareExtraPhoto: (photoItem: ObservationPhoto) => void;
  onDeleteExtraPhoto: (photoItem: ObservationPhoto) => void;
  onMakePrimary: (photoItem: ObservationPhoto) => void;
}) {
  return (
    <View style={styles.detailPanel}>
      <Pressable onPress={onBack} style={styles.smallPillButton}>
        <Text style={styles.smallPillButtonText}>Back to Saved Plants</Text>
      </Pressable>

      <Image source={{ uri: observation.photoUri }} style={styles.detailImage} />

      <View style={styles.cardTitleRow}>
        <View style={styles.cardTitleText}>
          <Text style={styles.detailTitle}>{observation.commonName}</Text>
          {observation.scientificName ? (
            <Text style={styles.scientificName}>{observation.scientificName}</Text>
          ) : null}
        </View>
        {observation.confidenceScore !== undefined ? (
          <View style={styles.confidenceBadge}>
            <Text style={styles.confidenceBadgeText}>
              {observation.confidenceScore}%
            </Text>
          </View>
        ) : null}
      </View>

      {observation.otherNames && observation.otherNames.length > 0 ? (
        <Text style={styles.cardMeta}>
          Also called: {observation.otherNames.join(", ")}
        </Text>
      ) : null}
      {observation.favorite ? (
        <Text style={styles.cardMeta}>Favorite plant</Text>
      ) : null}
      {observation.tags && observation.tags.length > 0 ? (
        <Text style={styles.cardMeta}>Tags: {observation.tags.join(", ")}</Text>
      ) : null}

      <View style={styles.metaGrid}>
        <MetaChip label="Date" value={formatDate(observation.observedAt)} />
        <MetaChip label="Time" value={formatTime(observation.observedAt)} />
        <MetaChip
          label="Accuracy"
          value={
            observation.accuracyMeters !== undefined
              ? `${formatMeters(observation.accuracyMeters)} m`
              : "unknown"
          }
        />
        <MetaChip label="Status" value={observation.collectionStatus ?? ""} />
        <MetaChip label="Interest" value={formatCollectionInterests(observation)} />
        <MetaChip label="Privacy" value={observation.privacyLevel ?? ""} />
        <MetaChip label="Sync" value={observation.syncStatus ?? ""} />
      </View>

      <View style={styles.detailInfoBox}>
        <Text style={styles.detailInfoLabel}>Location</Text>
        <Text style={styles.detailInfoText}>
          {formatCoordinate(observation.latitude)},{" "}
          {formatCoordinate(observation.longitude)}
        </Text>
      </View>

      {observation.returnDate || observation.gatherNotes ? (
        <View style={styles.detailInfoBox}>
          <Text style={styles.detailInfoLabel}>Return plan</Text>
          {observation.returnDate ? (
            <Text style={styles.detailInfoText}>Return: {observation.returnDate}</Text>
          ) : null}
          {observation.reminderScheduledFor ? (
            <Text style={styles.detailInfoText}>
              Reminder: {formatDate(observation.reminderScheduledFor)} at{" "}
              {formatTime(observation.reminderScheduledFor)}
            </Text>
          ) : null}
          {observation.gatherNotes ? (
            <Text style={styles.detailInfoText}>{observation.gatherNotes}</Text>
          ) : null}
        </View>
      ) : null}

      {observation.notes ? (
        <View style={styles.detailInfoBox}>
          <Text style={styles.detailInfoLabel}>Notes</Text>
          <Text style={styles.detailInfoText}>{observation.notes}</Text>
        </View>
      ) : null}

      {observation.syncStatus === "sync failed" && observation.syncError ? (
        <View style={styles.detailInfoBox}>
          <Text style={styles.detailInfoLabel}>Sync error</Text>
          <Text style={styles.errorText}>{observation.syncError}</Text>
        </View>
      ) : null}

      {observation.extraPhotos && observation.extraPhotos.length > 0 ? (
        <ExtraPhotoGallery
          photos={observation.extraPhotos}
          onShare={onShareExtraPhoto}
          onDelete={onDeleteExtraPhoto}
          onMakePrimary={onMakePrimary}
        />
      ) : null}

      <View style={styles.detailActions}>
        <ActionButton label="Edit" onPress={onEdit} />
        <ActionButton label="Open Map" onPress={onOpenMap} variant="secondary" />
      </View>
      <View style={styles.detailActions}>
        <ActionButton label="Add Photo" onPress={onAddPhoto} variant="secondary" />
        <ActionButton
          label="Share Photo"
          onPress={onSharePhoto}
          variant="secondary"
        />
      </View>
    </View>
  );
}

function ReturnCard({
  observation,
  onEdit,
  onOpenMap,
  onMarkReady,
  onMarkCollected,
  onSnooze
}: {
  observation: PlantObservation;
  onEdit: () => void;
  onOpenMap: () => void;
  onMarkReady: () => void;
  onMarkCollected: () => void;
  onSnooze: () => void;
}) {
  const exactReturnDate = observation.returnDate
    ? parseDateOnly(observation.returnDate)
    : undefined;

  return (
    <View style={styles.returnCard}>
      <View style={styles.returnDateBox}>
        <Text style={styles.returnMonth}>
          {exactReturnDate
            ? exactReturnDate.toLocaleDateString(undefined, { month: "short" })
            : "TBD"}
        </Text>
        <Text style={styles.returnDay}>
          {exactReturnDate ? exactReturnDate.getDate() : "--"}
        </Text>
      </View>
      <View style={styles.returnBody}>
        <Text style={styles.returnTitle}>{observation.commonName}</Text>
        <Text style={styles.returnMeta}>
          {observation.returnDate || "No exact date"} |{" "}
          {observation.collectionStatus ?? "return"}
        </Text>
        {observation.gatherNotes ? (
          <Text style={styles.returnNotes}>{observation.gatherNotes}</Text>
        ) : null}
        <View style={styles.returnActions}>
          <Pressable
            onPress={onMarkReady}
            style={[styles.cardActionButton, styles.returnActionButton]}
          >
            <Text style={styles.cardActionButtonText}>Ready</Text>
          </Pressable>
          <Pressable
            onPress={onMarkCollected}
            style={[styles.cardActionButton, styles.returnActionButton]}
          >
            <Text style={styles.cardActionButtonText}>Collected</Text>
          </Pressable>
          <Pressable
            onPress={onSnooze}
            style={[styles.cardActionButton, styles.returnActionButton]}
          >
            <Text style={styles.cardActionButtonText}>+7 days</Text>
          </Pressable>
          <Pressable
            onPress={onOpenMap}
            style={[styles.cardActionButton, styles.returnActionButton]}
          >
            <Text style={styles.cardActionButtonText}>Open Map</Text>
          </Pressable>
          <Pressable
            onPress={onEdit}
            style={[styles.cardActionButton, styles.returnActionButton]}
          >
            <Text style={styles.cardActionButtonText}>Edit</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ExtraPhotoGallery({
  photos,
  onShare,
  onDelete,
  onMakePrimary
}: {
  photos: ObservationPhoto[];
  onShare: (photoItem: ObservationPhoto) => void;
  onDelete: (photoItem: ObservationPhoto) => void;
  onMakePrimary: (photoItem: ObservationPhoto) => void;
}) {
  return (
    <View style={styles.extraGallery}>
      <Text style={styles.extraGalleryTitle}>Extra photos</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.extraGalleryRow}
      >
        {photos.map((photoItem, index) => (
          <View key={photoItem.id ?? photoItem.uri} style={styles.extraPhotoCard}>
            <Image source={{ uri: photoItem.uri }} style={styles.extraPhotoThumb} />
            <Text style={styles.extraPhotoLabel}>Photo {index + 1}</Text>
            <Pressable
              onPress={() => onMakePrimary(photoItem)}
              style={styles.extraPhotoAction}
            >
              <Text style={styles.extraPhotoActionText}>Make primary</Text>
            </Pressable>
            <Pressable
              onPress={() => onShare(photoItem)}
              style={styles.extraPhotoAction}
            >
              <Text style={styles.extraPhotoActionText}>Share</Text>
            </Pressable>
            <Pressable
              onPress={() => onDelete(photoItem)}
              style={styles.extraPhotoAction}
            >
              <Text style={styles.extraPhotoDeleteText}>Delete</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }

  return (
    <View style={styles.metaChip}>
      <Text style={styles.metaChipLabel}>{label}</Text>
      <Text style={styles.metaChipValue}>{value}</Text>
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.exportSummaryNumber}>{value}</Text>
      <Text style={styles.exportSummaryLabel}>{label}</Text>
    </View>
  );
}

function toCsv(rows: PlantObservation[]) {
  const header = csvColumns.map((column) => csvEscape(column.header)).join(",");
  const body = rows.map((row) =>
    csvColumns
      .map((column) => csvEscape(column.value(row)))
      .join(",")
  );
  return [header, ...body].join("\n");
}

function toGeoJson(rows: PlantObservation[]) {
  return JSON.stringify(
    {
      type: "FeatureCollection",
      features: rows.map((row) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [row.longitude, row.latitude]
        },
        properties: {
          id: row.id,
          cloudId: row.cloudId ?? "",
          ownerId: row.ownerId ?? LOCAL_OWNER_ID,
          privacyLevel: row.privacyLevel ?? DEFAULT_PRIVACY_LEVEL,
          syncStatus: row.syncStatus ?? DEFAULT_SYNC_STATUS,
          syncError: row.syncError ?? "",
          lastSyncedAt: row.lastSyncedAt ?? "",
          createdAt: row.createdAt ?? row.observedAt,
          updatedAt: row.updatedAt ?? row.observedAt,
          commonName: row.commonName,
          scientificName: row.scientificName ?? "",
          otherNames: row.otherNames ?? [],
          confidenceScore: row.confidenceScore ?? "",
          identificationStatus: row.identificationStatus ?? "",
          userConfirmed: row.userConfirmed,
          accuracyMeters: row.accuracyMeters ?? "",
          observedAt: row.observedAt,
          photoUri: row.photoUri,
          photoFileName: row.photoFileName ?? "",
          photoStoragePath: row.photoStoragePath ?? "",
          extraPhotos: row.extraPhotos ?? [],
          notes: row.notes ?? "",
          returnDate: row.returnDate ?? "",
          reminderLeadDays: row.reminderLeadDays ?? "",
          reminderScheduledFor: row.reminderScheduledFor ?? "",
          gatherNotes: row.gatherNotes ?? "",
          collectionTypes: row.collectionTypes ?? row.collectionType ?? "",
          collectionStatus: row.collectionStatus ?? "",
          favorite: row.favorite ?? false,
          tags: row.tags ?? []
        }
      }))
    },
    null,
    2
  );
}

function toSupabaseObservationRow(
  observation: PlantObservation,
  userId: string,
  uploadedAt: string
) {
  return {
    id: observation.id,
    user_id: userId,
    owner_id: userId,
    privacy_level: observation.privacyLevel ?? DEFAULT_PRIVACY_LEVEL,
    sync_status: "synced",
    sync_error: null,
    last_synced_at: uploadedAt,
    created_at: observation.createdAt ?? observation.observedAt,
    updated_at: observation.updatedAt ?? uploadedAt,
    common_name: observation.commonName,
    scientific_name: observation.scientificName ?? null,
    other_names: observation.otherNames ?? [],
    confidence_score: observation.confidenceScore ?? null,
    identification_status: observation.identificationStatus ?? null,
    identification_error: observation.identificationError ?? null,
    identified_at: observation.identifiedAt ?? null,
    user_confirmed: observation.userConfirmed,
    latitude: observation.latitude,
    longitude: observation.longitude,
    accuracy_meters: observation.accuracyMeters ?? null,
    observed_at: observation.observedAt,
    photo_uri: observation.photoUri,
    photo_file_name: observation.photoFileName ?? null,
    photo_storage_path: observation.photoStoragePath ?? null,
    notes: observation.notes ?? null,
    return_date: observation.returnDate ?? null,
    reminder_lead_days: observation.reminderLeadDays ?? null,
    reminder_scheduled_for: observation.reminderScheduledFor ?? null,
    gather_notes: observation.gatherNotes ?? null,
    collection_interests:
      observation.collectionTypes ??
      (observation.collectionType ? [observation.collectionType] : []),
    collection_status: observation.collectionStatus ?? null,
    favorite: observation.favorite ?? false,
    tags: observation.tags ?? []
  };
}

function toSupabasePhotoRows(observation: PlantObservation, userId: string) {
  const primaryPhoto: ObservationPhoto = {
    id: `${observation.id}_primary`,
    uri: observation.photoUri,
    fileName: observation.photoFileName,
    storagePath: observation.photoStoragePath,
    addedAt: observation.observedAt,
    syncStatus: observation.syncStatus
  };

  return [primaryPhoto, ...(observation.extraPhotos ?? [])].map((photoItem, index) => ({
    id: photoItem.id ?? `${observation.id}_photo_${index}`,
    observation_id: observation.id,
    user_id: userId,
    local_uri: photoItem.uri,
    storage_path: photoItem.storagePath ?? null,
    file_name: photoItem.fileName ?? getFileName(photoItem.uri),
    photo_role: index === 0 ? "primary" : "extra",
    added_at: photoItem.addedAt,
    sync_status: "synced",
    sync_error: null
  }));
}

function fromSupabaseObservationRow(
  row: Record<string, unknown>,
  userId: string,
  downloadedAt: string
): PlantObservation {
  const observedAt =
    stringValue(row.observed_at) ??
    stringValue(row.created_at) ??
    downloadedAt;
  const collectionTypesFromCloud = collectionTypeArray(row.collection_interests);
  const collectionStatus = collectionStatusValue(row.collection_status);

  return {
    id: stringValue(row.id) ?? createObservationId(),
    cloudId: stringValue(row.id),
    ownerId: stringValue(row.owner_id) ?? stringValue(row.user_id) ?? userId,
    privacyLevel: privacyLevelValue(row.privacy_level) ?? DEFAULT_PRIVACY_LEVEL,
    syncStatus: "synced",
    syncError: undefined,
    lastSyncedAt: downloadedAt,
    createdAt: stringValue(row.created_at) ?? observedAt,
    updatedAt: stringValue(row.updated_at) ?? downloadedAt,
    commonName: stringValue(row.common_name) ?? "Unknown plant",
    scientificName: stringValue(row.scientific_name),
    otherNames: stringArray(row.other_names),
    confidenceScore: numberValue(row.confidence_score),
    identificationStatus: identificationStatusValue(row.identification_status),
    identificationError: stringValue(row.identification_error),
    identifiedAt: stringValue(row.identified_at),
    userConfirmed: booleanValue(row.user_confirmed),
    latitude: numberValue(row.latitude) ?? 0,
    longitude: numberValue(row.longitude) ?? 0,
    accuracyMeters: numberValue(row.accuracy_meters),
    observedAt,
    photoUri: stringValue(row.photo_uri) ?? "",
    photoFileName: stringValue(row.photo_file_name),
    photoStoragePath: stringValue(row.photo_storage_path),
    notes: stringValue(row.notes),
    returnDate: stringValue(row.return_date),
    reminderLeadDays: reminderLeadDaysValue(row.reminder_lead_days),
    reminderScheduledFor: stringValue(row.reminder_scheduled_for),
    gatherNotes: stringValue(row.gather_notes),
    collectionType: collectionTypesFromCloud[0],
    collectionTypes: collectionTypesFromCloud,
    collectionStatus,
    favorite: booleanValue(row.favorite),
    tags: stringArray(row.tags)
  };
}

function mergeCloudObservations(
  localRecords: PlantObservation[],
  cloudRecords: PlantObservation[]
) {
  let importedCount = 0;
  let updatedCount = 0;
  let conflictCount = 0;
  const mergedById = new Map(localRecords.map((record) => [record.id, record]));

  cloudRecords.forEach((cloudRecord) => {
    const localRecord = mergedById.get(cloudRecord.id);
    if (!localRecord) {
      importedCount += 1;
      mergedById.set(cloudRecord.id, cloudRecord);
      return;
    }

    const localSyncStatus = localRecord.syncStatus ?? DEFAULT_SYNC_STATUS;
    const localHasUnsyncedWork =
      localSyncStatus === "pending upload" || localSyncStatus === "sync failed";

    if (localHasUnsyncedWork) {
      conflictCount += 1;
      mergedById.set(cloudRecord.id, {
        ...localRecord,
        syncError:
          "Cloud download found this record, but local unsynced edits were kept."
      });
      return;
    }

    if (getUpdatedTime(cloudRecord) >= getUpdatedTime(localRecord)) {
      updatedCount += 1;
      mergedById.set(cloudRecord.id, {
        ...cloudRecord,
        photoUri: cloudRecord.photoUri || localRecord.photoUri,
        extraPhotos: localRecord.extraPhotos ?? cloudRecord.extraPhotos
      });
    }
  });

  const merged = [...mergedById.values()].sort(
    (a, b) => getObservedTime(b) - getObservedTime(a)
  );

  return { merged, importedCount, updatedCount, conflictCount };
}

function countObservationPhotos(observations: PlantObservation[]) {
  return observations.reduce(
    (total, observation) => total + 1 + (observation.extraPhotos?.length ?? 0),
    0
  );
}

async function uploadObservationPhotos(
  observation: PlantObservation,
  userId: string
) {
  if (!supabase) {
    return observation;
  }

  const primaryFileName = observation.photoFileName ?? getFileName(observation.photoUri);
  const primaryStoragePath = createPhotoStoragePath(
    userId,
    observation.id,
    "primary",
    primaryFileName
  );

  await uploadFileUriToSupabaseStorage(observation.photoUri, primaryStoragePath);

  const uploadedExtraPhotos = await Promise.all(
    (observation.extraPhotos ?? []).map(async (photoItem, index) => {
      const fileName = photoItem.fileName ?? getFileName(photoItem.uri);
      const storagePath = createPhotoStoragePath(
        userId,
        observation.id,
        `extra-${index + 1}`,
        fileName
      );

      await uploadFileUriToSupabaseStorage(photoItem.uri, storagePath);

      return {
        ...photoItem,
        fileName,
        storagePath,
        syncStatus: "synced" as SyncStatus,
        syncError: undefined
      };
    })
  );

  return {
    ...observation,
    ownerId: userId,
    photoFileName: primaryFileName,
    photoStoragePath: primaryStoragePath,
    extraPhotos: uploadedExtraPhotos
  };
}

async function uploadFileUriToSupabaseStorage(uri: string, storagePath: string) {
  if (!supabase) {
    return;
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64
  });
  const fileBytes = base64ToArrayBuffer(base64);
  const contentType = getContentType(storagePath);
  const { error } = await supabase.storage
    .from(PLANT_PHOTOS_BUCKET)
    .upload(storagePath, fileBytes, {
      contentType,
      upsert: true
    });

  if (error) {
    throw error;
  }
}

function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function getContentType(fileNameOrPath: string) {
  const extension = getFileExtension(fileNameOrPath);
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  return "image/jpeg";
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join("; ") : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function getFileName(uri: string) {
  return uri.split("/").pop() ?? uri;
}

function createObservationId() {
  return `obs_${createUuid()}`;
}

function createPhotoId() {
  return `photo_${createUuid()}`;
}

function createUuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function createPhotoStoragePath(
  ownerId: string,
  observationId: string,
  photoRole: string,
  fileName: string
) {
  const extension = getFileExtension(fileName);
  return `users/${ownerId}/observations/${observationId}/${photoRole}.${extension}`;
}

function getFileExtension(fileNameOrUri: string) {
  const fileName = getFileName(fileNameOrUri);
  const extension = fileName.includes(".") ? fileName.split(".").pop() : "jpg";
  return extension?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
}

function toSafeFileName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "plant";
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function formatDate(value?: string) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function formatTime(value?: string) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatMeters(value?: number) {
  return value === undefined ? "" : Math.round(value * 10) / 10;
}

function formatPercent(value?: number) {
  return value === undefined ? "" : Math.round(value * 10) / 10;
}

function formatBoolean(value: boolean) {
  return value ? "Yes" : "No";
}

function formatCollectionInterests(observation: PlantObservation) {
  return (
    observation.collectionTypes ??
    (observation.collectionType ? [observation.collectionType] : [])
  ).join(", ");
}

function getCollectionTypes(observation: PlantObservation) {
  return (
    observation.collectionTypes ??
    (observation.collectionType ? [observation.collectionType] : [])
  );
}

function parsePlantSuggestions(payload: unknown): PlantSuggestion[] {
  const results =
    payload && typeof payload === "object" && "results" in payload
      ? (payload as { results?: unknown }).results
      : undefined;

  if (!Array.isArray(results)) {
    return [];
  }

  return results
    .map((result) => {
      const record = result as Record<string, unknown>;
      const species = record.species as Record<string, unknown> | undefined;
      const commonNames = Array.isArray(species?.commonNames)
        ? species.commonNames.filter(
            (name): name is string => typeof name === "string" && name.length > 0
          )
        : [];
      const commonName = commonNames[0] ?? "";
      const scientificName =
        typeof species?.scientificNameWithoutAuthor === "string"
          ? species.scientificNameWithoutAuthor
          : "";
      const confidenceScore =
        typeof record.score === "number"
          ? Math.round(record.score * 1000) / 10
          : undefined;

      return {
        commonName,
        scientificName,
        otherNames: commonNames.filter((name) => name !== commonName).slice(0, 8),
        confidenceScore
      };
    })
    .filter((suggestion) => suggestion.commonName || suggestion.scientificName);
}

function getGpsStatus(location: Location.LocationObject | null) {
  if (!location) {
    return { label: "Acquiring GPS...", color: "#aeb7a5" };
  }

  const accuracy = location.coords.accuracy;
  if (accuracy === null || accuracy === undefined) {
    return { label: "GPS acquired", color: "#8fa13f" };
  }

  if (accuracy <= 5) {
    return { label: `Excellent GPS (${Math.round(accuracy)} m)`, color: "#1b7f3a" };
  }
  if (accuracy <= 15) {
    return { label: `Good GPS (${Math.round(accuracy)} m)`, color: "#2f6f3e" };
  }
  if (accuracy <= 35) {
    return { label: `Fair GPS (${Math.round(accuracy)} m)`, color: "#caa52d" };
  }
  return { label: `Poor GPS (${Math.round(accuracy)} m)`, color: "#a33a2b" };
}

function isBetterLocation(
  previous: Location.LocationObject | null,
  next: Location.LocationObject
) {
  if (!previous) {
    return true;
  }
  const previousAccuracy = previous.coords.accuracy ?? Number.MAX_SAFE_INTEGER;
  const nextAccuracy = next.coords.accuracy ?? Number.MAX_SAFE_INTEGER;
  return nextAccuracy <= previousAccuracy;
}

function getObservationSearchText(observation: PlantObservation) {
  return [
    observation.commonName,
    observation.scientificName,
    ...(observation.otherNames ?? []),
    observation.notes,
    observation.gatherNotes,
    observation.collectionStatus,
    ...getCollectionTypes(observation),
    ...(observation.tags ?? []),
    observation.syncStatus,
    observation.privacyLevel
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getObservedTime(observation: PlantObservation) {
  return new Date(observation.observedAt).getTime();
}

function getUpdatedTime(observation: PlantObservation) {
  return new Date(observation.updatedAt ?? observation.observedAt).getTime();
}

function getDistanceMeters(
  coords: Pick<Location.LocationObjectCoords, "latitude" | "longitude">,
  observation: PlantObservation
) {
  const radiusMeters = 6371000;
  const lat1 = toRadians(coords.latitude);
  const lat2 = toRadians(observation.latitude);
  const deltaLat = toRadians(observation.latitude - coords.latitude);
  const deltaLon = toRadians(observation.longitude - coords.longitude);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusMeters * c;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getLatestSyncedAt(observations: PlantObservation[]) {
  return observations.reduce<string | undefined>((latest, observation) => {
    if (!observation.lastSyncedAt) {
      return latest;
    }
    if (!latest) {
      return observation.lastSyncedAt;
    }
    return new Date(observation.lastSyncedAt).getTime() >
      new Date(latest).getTime()
      ? observation.lastSyncedAt
      : latest;
  }, undefined);
}

function formatLastSyncedAt(value?: string) {
  if (!value) {
    return "not synced yet";
  }
  return `${formatDate(value)} at ${formatTime(value)}`;
}

function createRegion(
  latitude: number,
  longitude: number,
  latitudeDelta: number
): Region {
  return {
    latitude,
    longitude,
    latitudeDelta,
    longitudeDelta: latitudeDelta
  };
}

function createDatasetRegion(observations: PlantObservation[]) {
  const locatedObservations = observations.filter(hasValidCoordinates);
  if (locatedObservations.length === 0) {
    return undefined;
  }

  const latitudes = locatedObservations.map((item) => item.latitude);
  const longitudes = locatedObservations.map((item) => item.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeDelta = Math.max(0.02, (maxLatitude - minLatitude) * 1.8);
  const longitudeDelta = Math.max(0.02, (maxLongitude - minLongitude) * 1.8);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta,
    longitudeDelta
  };
}

function hasValidCoordinates(observation: PlantObservation) {
  return (
    Number.isFinite(observation.latitude) &&
    Number.isFinite(observation.longitude) &&
    Math.abs(observation.latitude) <= 90 &&
    Math.abs(observation.longitude) <= 180
  );
}

function isNeedReturnObservation(observation: PlantObservation, today: Date) {
  const returnDate = observation.returnDate
    ? parseDateOnly(observation.returnDate)
    : undefined;
  return (
    observation.collectionStatus === "return later" ||
    observation.collectionStatus === "not ready" ||
    observation.collectionStatus === "ready now" ||
    (!!returnDate && returnDate <= today)
  );
}

function getMapDisplayItems(
  observations: PlantObservation[],
  region: Region | null
) {
  if (observations.length <= 600) {
    return observations.map((observation) => ({
      id: observation.id,
      latitude: observation.latitude,
      longitude: observation.longitude,
      count: 1,
      observation
    }));
  }

  const latitudeDelta = region?.latitudeDelta ?? 0.05;
  const cellSize = Math.max(0.0004, latitudeDelta / 80);
  const groups = new Map<
    string,
    {
      id: string;
      latitude: number;
      longitude: number;
      count: number;
      observation?: PlantObservation;
    }
  >();

  observations.forEach((observation) => {
    const latBucket = Math.round(observation.latitude / cellSize);
    const lonBucket = Math.round(observation.longitude / cellSize);
    const key = `${latBucket}:${lonBucket}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        id: key,
        latitude: observation.latitude,
        longitude: observation.longitude,
        count: 1,
        observation
      });
      return;
    }

    existing.latitude =
      (existing.latitude * existing.count + observation.latitude) /
      (existing.count + 1);
    existing.longitude =
      (existing.longitude * existing.count + observation.longitude) /
      (existing.count + 1);
    existing.count += 1;
    existing.observation = undefined;
  });

  return [...groups.values()];
}

function getMapPinColor(observation?: PlantObservation) {
  if (!observation) {
    return "#17391f";
  }

  if (observation.collectionStatus === "ready now") {
    return "#1b7f3a";
  }
  if (observation.collectionStatus === "collected") {
    return "#5b6f5b";
  }
  if (observation.collectionStatus === "do not collect") {
    return "#7a7a7a";
  }
  if (
    observation.collectionStatus === "return later" ||
    observation.collectionStatus === "not ready" ||
    observation.returnDate
  ) {
    return "#c47a24";
  }
  if ((observation.syncStatus ?? DEFAULT_SYNC_STATUS) === "local only") {
    return "#2f6f3e";
  }
  return "#17391f";
}

function formatDistance(meters: number) {
  if (meters >= 1609.344) {
    return `${(meters / 1609.344).toFixed(1)} mi`;
  }
  return `${Math.round(meters)} m`;
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown) {
  return value === true;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function collectionTypeArray(value: unknown): CollectionType[] {
  return stringArray(value).filter((item): item is CollectionType =>
    collectionTypes.includes(item as CollectionType)
  );
}

function collectionStatusValue(value: unknown) {
  return typeof value === "string" &&
    collectionStatuses.includes(value as CollectionStatus)
    ? (value as CollectionStatus)
    : undefined;
}

function privacyLevelValue(value: unknown) {
  return typeof value === "string" && privacyLevels.includes(value as PrivacyLevel)
    ? (value as PrivacyLevel)
    : undefined;
}

function identificationStatusValue(value: unknown) {
  const statuses: PlantObservation["identificationStatus"][] = [
    "manual",
    "suggested",
    "needs ID",
    "failed"
  ];
  return typeof value === "string" &&
    statuses.includes(value as PlantObservation["identificationStatus"])
    ? (value as PlantObservation["identificationStatus"])
    : undefined;
}

function reminderLeadDaysValue(value: unknown) {
  return value === 1 || value === 3 || value === 7 ? value : undefined;
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatDateForInput(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month ||
    parsed.getDate() !== day
  ) {
    return undefined;
  }

  return parsed;
}

function getReturnSortTime(observation: PlantObservation) {
  const exactReturnDate = observation.returnDate
    ? parseDateOnly(observation.returnDate)
    : undefined;
  return exactReturnDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function getScreenTitle(screen: AppScreen) {
  switch (screen) {
    case "new":
      return "New plant";
    case "saved":
      return "Saved plants";
    case "map":
      return "Map";
    case "detail":
      return "Plant detail";
    case "returns":
      return "Return list";
    case "cloud":
      return "Cloud prep";
    case "account":
      return "Account";
    case "export":
      return "Export";
    case "about":
      return "About BCN";
    default:
      return "Field collection";
  }
}

function formatShortId(id?: string | null) {
  if (!id) {
    return "signed_in_user";
  }
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    const parts = [
      errorRecord.message,
      errorRecord.error_description,
      errorRecord.details,
      errorRecord.hint,
      errorRecord.code ? `Code: ${errorRecord.code}` : undefined
    ].filter((part): part is string => typeof part === "string" && part.length > 0);

    if (parts.length > 0) {
      return parts.join(" ");
    }

    try {
      return JSON.stringify(errorRecord);
    } catch {
      return "Something went wrong.";
    }
  }

  return "Something went wrong.";
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f4f7ee"
  },
  container: {
    flex: 1
  },
  content: {
    padding: 12,
    paddingBottom: 36,
    paddingTop: 30,
    gap: 10
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 42
  },
  menuButton: {
    backgroundColor: "#17391f",
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  menuButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800"
  },
  topBarText: {
    flex: 1
  },
  topBarTitle: {
    color: "#17391f",
    fontSize: 18,
    fontWeight: "800"
  },
  topBarSubtitle: {
    color: "#53654c",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 1
  },
  menu: {
    backgroundColor: "#ffffff",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden"
  },
  menuItem: {
    borderBottomColor: "#eef4e8",
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  menuItemActive: {
    backgroundColor: "#e7efdf"
  },
  menuItemText: {
    color: "#214c2b",
    fontSize: 15,
    fontWeight: "800"
  },
  menuItemTextActive: {
    color: "#17391f"
  },
  cover: {
    backgroundColor: "#ffffff",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14
  },
  homeLogo: {
    alignSelf: "center",
    height: 62,
    resizeMode: "contain",
    width: "100%"
  },
  coverHero: {
    backgroundColor: "#f8faf4",
    borderRadius: 8,
    gap: 6,
    padding: 12
  },
  coverKicker: {
    color: "#4b5d42",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  coverTitle: {
    color: "#17391f",
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 32
  },
  coverSubtitle: {
    color: "#4b5d42",
    fontSize: 15,
    lineHeight: 21
  },
  coverStats: {
    flexDirection: "row",
    gap: 8
  },
  statBox: {
    backgroundColor: "#eef4e8",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 11
  },
  statNumber: {
    color: "#17391f",
    fontSize: 22,
    fontWeight: "900"
  },
  statLabel: {
    color: "#4b5d42",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2
  },
  homeLatest: {
    backgroundColor: "#17391f",
    borderRadius: 8,
    gap: 3,
    padding: 12
  },
  homeLatestLabel: {
    color: "#c8d7bf",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  homeLatestTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900"
  },
  homeLatestMeta: {
    color: "#e7efdf",
    fontSize: 13,
    fontWeight: "700"
  },
  quickList: {
    backgroundColor: "#f8faf4",
    borderColor: "#e3eadb",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12
  },
  quickListItem: {
    color: "#263b22",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19
  },
  header: {
    gap: 6,
    paddingVertical: 8
  },
  title: {
    color: "#17391f",
    fontSize: 27,
    fontWeight: "800"
  },
  subtitle: {
    color: "#4b5d42",
    fontSize: 15,
    lineHeight: 21
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderWidth: 1,
    gap: 11,
    padding: 12
  },
  sectionHeaderRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  sectionHeaderText: {
    flex: 1,
    gap: 3
  },
  smallPillButton: {
    backgroundColor: "#eef4e8",
    borderColor: "#d4dfca",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7
  },
  smallPillButtonText: {
    color: "#214c2b",
    fontSize: 13,
    fontWeight: "800"
  },
  sectionTitle: {
    color: "#17391f",
    fontSize: 22,
    fontWeight: "800"
  },
  aboutKicker: {
    color: "#4b5d42",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  aboutLogo: {
    alignSelf: "center",
    height: 72,
    resizeMode: "contain",
    width: "100%"
  },
  panelText: {
    color: "#263b22",
    fontSize: 15,
    lineHeight: 22
  },
  hintText: {
    color: "#53654c",
    fontSize: 14,
    lineHeight: 20
  },
  errorText: {
    color: "#a33a2b",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  exportGrid: {
    flexDirection: "row",
    gap: 8
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  statTile: {
    backgroundColor: "#eef4e8",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    flexBasis: "31%",
    minWidth: 96,
    padding: 12
  },
  exportSummary: {
    backgroundColor: "#eef4e8",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 12
  },
  exportSummaryNumber: {
    color: "#17391f",
    fontSize: 24,
    fontWeight: "900"
  },
  exportSummaryLabel: {
    color: "#4b5d42",
    fontSize: 14,
    fontWeight: "800"
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: "#2f6f3e",
    borderRadius: 8,
    flex: 1,
    minHeight: 43,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  secondaryButton: {
    backgroundColor: "#e7efdf"
  },
  disabledButton: {
    opacity: 0.55
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center"
  },
  secondaryButtonText: {
    color: "#214c2b"
  },
  previewImage: {
    aspectRatio: 5 / 4,
    backgroundColor: "#e7efdf",
    borderRadius: 8,
    width: "100%"
  },
  emptyPhoto: {
    alignItems: "center",
    aspectRatio: 5 / 4,
    backgroundColor: "#eef4e8",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderStyle: "dashed",
    borderWidth: 1,
    justifyContent: "center"
  },
  emptyPhotoText: {
    color: "#62735a",
    fontWeight: "700"
  },
  locationText: {
    color: "#4b5d42",
    fontSize: 13
  },
  identificationPanel: {
    backgroundColor: "#f8faf4",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 11
  },
  identificationLabel: {
    color: "#17391f",
    fontSize: 14,
    fontWeight: "800"
  },
  identificationText: {
    color: "#4b5d42",
    fontSize: 13,
    fontWeight: "700"
  },
  identificationError: {
    color: "#a33a2b",
    fontSize: 13,
    fontWeight: "700"
  },
  gpsStatus: {
    alignItems: "center",
    backgroundColor: "#f8faf4",
    borderColor: "#d9e2cf",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  gpsDot: {
    borderRadius: 6,
    height: 12,
    width: 12
  },
  gpsStatusText: {
    color: "#263b22",
    fontSize: 13,
    fontWeight: "800"
  },
  suggestionList: {
    gap: 7,
    marginTop: 4
  },
  suggestionRow: {
    backgroundColor: "#eef4e8",
    borderColor: "#d4dfca",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  suggestionRowTitle: {
    color: "#17391f",
    fontSize: 14,
    fontWeight: "900"
  },
  suggestionRowMeta: {
    color: "#53654c",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2
  },
  field: {
    gap: 7
  },
  label: {
    color: "#263b22",
    fontSize: 14,
    fontWeight: "800"
  },
  helperText: {
    color: "#62735a",
    fontSize: 12,
    fontWeight: "700"
  },
  input: {
    backgroundColor: "#f8faf4",
    borderColor: "#cad8c0",
    borderRadius: 8,
    borderWidth: 1,
    color: "#172415",
    fontSize: 16,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  multilineInput: {
    minHeight: 78,
    textAlignVertical: "top"
  },
  datePickerButton: {
    backgroundColor: "#f8faf4",
    borderColor: "#cad8c0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    minHeight: 70,
    justifyContent: "center",
    paddingHorizontal: 13,
    paddingVertical: 11
  },
  datePickerValue: {
    color: "#17391f",
    fontSize: 24,
    fontWeight: "900"
  },
  datePickerHint: {
    color: "#62735a",
    fontSize: 13,
    fontWeight: "700"
  },
  dateQuickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  dateQuickButton: {
    backgroundColor: "#eef4e8",
    borderColor: "#d4dfca",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  dateQuickButtonText: {
    color: "#214c2b",
    fontSize: 13,
    fontWeight: "800"
  },
  favoriteToggle: {
    alignItems: "center",
    backgroundColor: "#eef4e8",
    borderColor: "#d4dfca",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  favoriteToggleActive: {
    backgroundColor: "#17391f",
    borderColor: "#17391f"
  },
  favoriteToggleText: {
    color: "#214c2b",
    fontSize: 14,
    fontWeight: "800"
  },
  favoriteToggleTextActive: {
    color: "#ffffff"
  },
  advancedToggle: {
    alignItems: "center",
    backgroundColor: "#f8faf4",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  advancedToggleText: {
    color: "#214c2b",
    fontSize: 14,
    fontWeight: "900"
  },
  advancedPanel: {
    backgroundColor: "#f8faf4",
    borderColor: "#e3eadb",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 10
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    backgroundColor: "#eef4e8",
    borderColor: "#d4dfca",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7
  },
  chipSelected: {
    backgroundColor: "#2f6f3e",
    borderColor: "#2f6f3e"
  },
  chipText: {
    color: "#284226",
    fontSize: 13,
    fontWeight: "700"
  },
  chipTextSelected: {
    color: "#ffffff"
  },
  nameSuggestions: {
    backgroundColor: "#f8faf4",
    borderColor: "#e3eadb",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 10
  },
  nameSuggestionsLabel: {
    color: "#53654c",
    fontSize: 13,
    fontWeight: "800"
  },
  suggestionChip: {
    backgroundColor: "#e7efdf",
    borderColor: "#d4dfca",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7
  },
  suggestionChipText: {
    color: "#214c2b",
    fontSize: 13,
    fontWeight: "800"
  },
  listHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  exportButton: {
    backgroundColor: "#17391f",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  exportButtonText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  emptyState: {
    backgroundColor: "#ffffff",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 16
  },
  emptyStateTitle: {
    color: "#17391f",
    fontSize: 17,
    fontWeight: "800"
  },
  emptyStateText: {
    color: "#4b5d42",
    lineHeight: 20
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  filterChip: {
    backgroundColor: "#eef4e8",
    borderColor: "#d4dfca",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  filterChipActive: {
    backgroundColor: "#17391f",
    borderColor: "#17391f"
  },
  filterChipText: {
    color: "#214c2b",
    fontSize: 13,
    fontWeight: "800"
  },
  filterChipTextActive: {
    color: "#ffffff"
  },
  mapPanel: {
    backgroundColor: "#ffffff",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  mapControls: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  mapControlButton: {
    backgroundColor: "#e7efdf",
    borderColor: "#d4dfca",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  mapControlText: {
    color: "#214c2b",
    fontSize: 13,
    fontWeight: "800"
  },
  mapIconButton: {
    alignItems: "center",
    backgroundColor: "#17391f",
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  mapIconText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 22
  },
  mapFrame: {
    backgroundColor: "#eef4e8",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderWidth: 1,
    height: 430,
    overflow: "hidden"
  },
  mapLegend: {
    backgroundColor: "#f8faf4",
    borderColor: "#e3eadb",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    padding: 9
  },
  mapLegendItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5
  },
  mapLegendDot: {
    borderRadius: 6,
    height: 12,
    width: 12
  },
  mapLegendText: {
    color: "#53654c",
    fontSize: 12,
    fontWeight: "800"
  },
  mapList: {
    backgroundColor: "#f8faf4",
    borderColor: "#e3eadb",
    borderRadius: 8,
    borderWidth: 1,
    gap: 7,
    padding: 8
  },
  mapListItem: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e3eadb",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    padding: 10
  },
  mapListItemActive: {
    borderColor: "#17391f",
    borderWidth: 2
  },
  mapListItemText: {
    flex: 1
  },
  mapListTitle: {
    color: "#17391f",
    fontSize: 15,
    fontWeight: "900"
  },
  mapListMeta: {
    color: "#53654c",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2
  },
  map: {
    flex: 1
  },
  mapPin: {
    alignItems: "center",
    borderColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 2,
    elevation: 3,
    height: 28,
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    width: 28
  },
  mapPinSelected: {
    borderColor: "#f4d35e",
    borderWidth: 3,
    height: 34,
    width: 34
  },
  mapPinCore: {
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    borderRadius: 4,
    height: 8,
    width: 8
  },
  clusterMarker: {
    alignItems: "center",
    backgroundColor: "#17391f",
    borderColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 2,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  clusterMarkerText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  mapSummaryCard: {
    backgroundColor: "#ffffff",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    overflow: "hidden",
    padding: 10
  },
  mapSummaryImage: {
    backgroundColor: "#e7efdf",
    borderRadius: 8,
    height: 92,
    width: 92
  },
  mapSummaryBody: {
    flex: 1,
    gap: 7
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden"
  },
  detailPanel: {
    backgroundColor: "#ffffff",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12
  },
  detailImage: {
    aspectRatio: 4 / 3,
    backgroundColor: "#e7efdf",
    borderRadius: 8,
    width: "100%"
  },
  detailTitle: {
    color: "#17391f",
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 30
  },
  detailInfoBox: {
    backgroundColor: "#f8faf4",
    borderColor: "#e3eadb",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 10
  },
  detailInfoLabel: {
    color: "#718066",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  detailInfoText: {
    color: "#263b22",
    fontSize: 15,
    lineHeight: 21
  },
  detailActions: {
    flexDirection: "row",
    gap: 10
  },
  cardImage: {
    aspectRatio: 16 / 9,
    backgroundColor: "#e7efdf",
    width: "100%"
  },
  cardBody: {
    gap: 7,
    padding: 12
  },
  cardTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  cardTitleText: {
    flex: 1
  },
  cardTitle: {
    color: "#17391f",
    fontSize: 18,
    fontWeight: "800"
  },
  scientificName: {
    color: "#486241",
    fontSize: 14,
    fontStyle: "italic"
  },
  cardMeta: {
    color: "#53654c",
    fontSize: 13
  },
  confidenceBadge: {
    backgroundColor: "#e7efdf",
    borderColor: "#d4dfca",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  confidenceBadgeText: {
    color: "#17391f",
    fontSize: 12,
    fontWeight: "900"
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  metaChip: {
    backgroundColor: "#f8faf4",
    borderColor: "#e3eadb",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  metaChipLabel: {
    color: "#718066",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  metaChipValue: {
    color: "#263b22",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 1
  },
  cardNotes: {
    color: "#263b22",
    lineHeight: 20,
    paddingTop: 4
  },
  extraGallery: {
    backgroundColor: "#f8faf4",
    borderColor: "#e3eadb",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 10
  },
  extraGalleryTitle: {
    color: "#17391f",
    fontSize: 14,
    fontWeight: "900"
  },
  extraGalleryRow: {
    gap: 10,
    paddingRight: 4
  },
  extraPhotoCard: {
    backgroundColor: "#ffffff",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    width: 132
  },
  extraPhotoThumb: {
    aspectRatio: 1,
    backgroundColor: "#e7efdf",
    width: "100%"
  },
  extraPhotoLabel: {
    color: "#263b22",
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingTop: 7
  },
  extraPhotoAction: {
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  extraPhotoActionText: {
    color: "#2f6f3e",
    fontSize: 12,
    fontWeight: "800"
  },
  extraPhotoDeleteText: {
    color: "#a33a2b",
    fontSize: 12,
    fontWeight: "800"
  },
  cardActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 8
  },
  cardActionButton: {
    paddingVertical: 4
  },
  cardActionButtonText: {
    color: "#2f6f3e",
    fontWeight: "800"
  },
  deleteButton: {
    alignSelf: "flex-start",
    paddingVertical: 4
  },
  deleteButtonText: {
    color: "#a33a2b",
    fontWeight: "800"
  },
  returnCard: {
    backgroundColor: "#ffffff",
    borderColor: "#d9e2cf",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12
  },
  returnDateBox: {
    alignItems: "center",
    backgroundColor: "#17391f",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 70,
    width: 66
  },
  returnMonth: {
    color: "#c8d7bf",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  returnDay: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "900"
  },
  returnBody: {
    flex: 1,
    gap: 4
  },
  returnTitle: {
    color: "#17391f",
    fontSize: 18,
    fontWeight: "900"
  },
  returnMeta: {
    color: "#53654c",
    fontSize: 13,
    fontWeight: "700"
  },
  returnNotes: {
    color: "#263b22",
    fontSize: 14,
    lineHeight: 19
  },
  returnActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4
  },
  returnActionButton: {
    backgroundColor: "#eef4e8",
    borderColor: "#d9e2cf",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6
  }
});
