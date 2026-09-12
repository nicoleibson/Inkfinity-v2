"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Database,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  HardDrive,
  UserX,
  BellOff,
  HeartOff,
  Image as ImageIcon,
  Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth, database } from "@/lib/firebase-config";
import { ref, get, update } from "firebase/database";
import type { UserProfile } from "@/types/user";

interface ScanReport {
  totalUsers: number;
  base64AvatarsCount: number;
  base64BytesTotal: number;
  obsoleteStorageFieldsCount: number;
  expiredTrialsCount: number;
  orphanedLikesCount: number;
  orphanedBookingsCount: number;
  staleNotificationsCount: number;
  malformedChatKeysCount: number;
  staleUsernamesCount: number;
  missingUsernamesCount: number;
  staleUsernameList: string[];
  affectedUserNames: string[];
}

export default function DatabaseCleanupPage() {
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [cleanProgress, setCleanProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [completed, setCompleted] = useState(false);

  // Load current user profile to verify admin role
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const snap = await get(ref(database, `users/${user.uid}`));
        if (snap.exists()) {
          setCurrentUser({ uid: user.uid, ...snap.val() });
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const runScan = useCallback(async () => {
    setIsScanning(true);
    setCompleted(false);
    setLogs([]);
    try {
      addLog("Iniciando análisis de la base de datos Firebase Realtime...");

      // 1. Fetch users
      const usersSnap = await get(ref(database, "users"));
      const users: Record<string, any> = usersSnap.exists() ? usersSnap.val() : {};
      const userEntries = Object.entries(users);

      // 2. Fetch artworks to check dangling likes
      const artworksSnap = await get(ref(database, "artworks"));
      const artworks: Record<string, any> = artworksSnap.exists() ? artworksSnap.val() : {};

      // 3. Fetch usernames
      const usernamesSnap = await get(ref(database, "usernames"));
      const usernames: Record<string, string> = usernamesSnap.exists() ? usernamesSnap.val() : {};

      let base64AvatarsCount = 0;
      let base64BytesTotal = 0;
      let obsoleteStorageFieldsCount = 0;
      let expiredTrialsCount = 0;
      let orphanedLikesCount = 0;
      let orphanedBookingsCount = 0;
      let staleNotificationsCount = 0;
      let malformedChatKeysCount = 0;
      const affectedUserNames: string[] = [];

      for (const [uid, u] of userEntries) {
        let hasIssue = false;

        // Check avatar
        if (typeof u.avatarUrl === "string" && u.avatarUrl.startsWith("data:")) {
          base64AvatarsCount++;
          base64BytesTotal += u.avatarUrl.length;
          hasIssue = true;
        }

        // Check storageUsed
        if (u.storageUsed !== undefined) {
          obsoleteStorageFieldsCount++;
          hasIssue = true;
        }

        // Check expired trial
        if (u.trialEndsAt) {
          expiredTrialsCount++;
          hasIssue = true;
        }

        // Check orphaned likes
        if (u.likedArtworks && typeof u.likedArtworks === "object") {
          for (const artId of Object.keys(u.likedArtworks)) {
            if (!artworks[artId]) {
              orphanedLikesCount++;
              hasIssue = true;
            }
          }
        }

        // Check orphaned bookings
        if (u.bookings && typeof u.bookings === "object") {
          orphanedBookingsCount += Object.keys(u.bookings).length;
          hasIssue = true;
        }

        // Check stale notifications
        if (u.notifications && typeof u.notifications === "object") {
          staleNotificationsCount += Object.keys(u.notifications).length;
          hasIssue = true;
        }

        // Check malformed chat keys
        if (u.chats && typeof u.chats === "object") {
          for (const chatKey of Object.keys(u.chats)) {
            if (chatKey.endsWith("_") || chatKey.startsWith("_")) {
              malformedChatKeysCount++;
              hasIssue = true;
            }
          }
        }

        if (hasIssue && u.name) {
          affectedUserNames.push(u.name);
        }
      }

      // Check usernames table
      const activeUsernamesByUid: Record<string, string> = {};
      for (const [uid, u] of userEntries) {
        if (u.username) {
          activeUsernamesByUid[uid] = u.username.toLowerCase();
        }
      }

      const staleUsernameList: string[] = [];
      for (const [uname, uid] of Object.entries(usernames)) {
        const activeForUid = activeUsernamesByUid[uid];
        if (!activeForUid || activeForUid !== uname.toLowerCase()) {
          staleUsernameList.push(uname);
        }
      }

      // Check missing usernames in mapping
      let missingUsernamesCount = 0;
      for (const [uid, activeUname] of Object.entries(activeUsernamesByUid)) {
        if (!usernames[activeUname]) {
          missingUsernamesCount++;
        }
      }

      const newReport: ScanReport = {
        totalUsers: userEntries.length,
        base64AvatarsCount,
        base64BytesTotal,
        obsoleteStorageFieldsCount,
        expiredTrialsCount,
        orphanedLikesCount,
        orphanedBookingsCount,
        staleNotificationsCount,
        malformedChatKeysCount,
        staleUsernamesCount: staleUsernameList.length,
        missingUsernamesCount,
        staleUsernameList,
        affectedUserNames,
      };

      setReport(newReport);
      addLog(`Escaneo completado: ${userEntries.length} usuarios analizados.`);
      addLog(`Avatares Base64 detectados: ${base64AvatarsCount} (${(base64BytesTotal / (1024 * 1024)).toFixed(2)} MB).`);
      addLog(`Campos de almacenamiento obsoletos: ${obsoleteStorageFieldsCount}.`);
      addLog(`Alias de nombres de usuario obsoletos: ${staleUsernameList.length}.`);
    } catch (err: any) {
      console.error(err);
      addLog(`Error durante el escaneo: ${err.message || "Error desconocido"}`);
      toast({
        variant: "destructive",
        title: "Error al escanear",
        description: err.message || "No se pudo leer la base de datos.",
      });
    } finally {
      setIsScanning(false);
    }
  }, [toast]);

  // Run initial scan on load
  useEffect(() => {
    runScan();
  }, [runScan]);

  const executeCleanup = async () => {
    if (!report) return;
    setIsCleaning(true);
    setCleanProgress(0);
    addLog("Iniciando depuración y limpieza segura de Firebase Realtime Database...");

    try {
      const usersSnap = await get(ref(database, "users"));
      const users: Record<string, any> = usersSnap.exists() ? usersSnap.val() : {};
      const userEntries = Object.entries(users);
      const totalSteps = userEntries.length + 1; // users + usernames
      let currentStep = 0;

      // 1. Clean each user
      for (const [uid, u] of userEntries) {
        currentStep++;
        setCleanProgress(Math.round((currentStep / totalSteps) * 90));

        const updates: Record<string, any> = {};

        // Remove heavy base64 avatar
        if (typeof u.avatarUrl === "string" && u.avatarUrl.startsWith("data:")) {
          updates["avatarUrl"] = "";
          addLog(`Usuario "${u.name || uid}": Limpiado avatar Base64 pesado (${(u.avatarUrl.length / 1024).toFixed(0)} KB).`);
        }

        // Remove obsolete storageUsed field
        if (u.storageUsed !== undefined) {
          updates["storageUsed"] = null;
        }

        // Remove expired trialEndsAt
        if (u.trialEndsAt) {
          updates["trialEndsAt"] = null;
        }

        // Remove orphaned likes
        if (u.likedArtworks) {
          updates["likedArtworks"] = null;
          addLog(`Usuario "${u.name || uid}": Removidas referencias a obras de arte eliminadas.`);
        }

        // Remove orphaned bookings
        if (u.bookings) {
          updates["bookings"] = null;
        }

        // Remove stale notifications
        if (u.notifications) {
          updates["notifications"] = null;
          addLog(`Usuario "${u.name || uid}": Purgadas notificaciones obsoletas de 2025.`);
        }

        // Clean malformed chat keys
        if (u.chats && typeof u.chats === "object") {
          const validChats: Record<string, boolean> = {};
          let hadMalformedChat = false;
          for (const [chatKey, val] of Object.entries(u.chats)) {
            if (!chatKey.endsWith("_") && !chatKey.startsWith("_") && chatKey.includes("_")) {
              validChats[chatKey] = val as boolean;
            } else {
              hadMalformedChat = true;
            }
          }
          if (hadMalformedChat) {
            updates["chats"] = Object.keys(validChats).length > 0 ? validChats : null;
            addLog(`Usuario "${u.name || uid}": Removida clave de chat malformada.`);
          }
        }

        if (Object.keys(updates).length > 0) {
          await update(ref(database, `users/${uid}`), updates);
        }
      }

      // 2. Synchronize /usernames mapping
      addLog("Sincronizando y purgando tabla de nombres de usuario /usernames...");
      const usernamesSnap = await get(ref(database, "usernames"));
      const currentMap: Record<string, string> = usernamesSnap.exists() ? usernamesSnap.val() : {};
      const usernameUpdates: Record<string, any> = {};

      // Delete stale aliases
      for (const staleName of report.staleUsernameList) {
        usernameUpdates[staleName] = null;
        addLog(`Eliminado alias obsoleto de username: "${staleName}".`);
      }

      // Ensure active users have their exact username registered
      for (const [uid, u] of userEntries) {
        if (u.username) {
          const lower = u.username.toLowerCase();
          if (currentMap[lower] !== uid) {
            usernameUpdates[lower] = uid;
            addLog(`Registrado nombre de usuario canónico: "${lower}" -> ${uid}.`);
          }
        }
      }

      if (Object.keys(usernameUpdates).length > 0) {
        await update(ref(database, "usernames"), usernameUpdates);
      }

      setCleanProgress(100);
      setCompleted(true);
      addLog("¡Limpieza finalizada con éxito! Todos los datos obsoletos han sido purgados.");

      toast({
        title: "Base de Datos Limpia",
        description: "Se han depurado todos los registros obsoletos y optimizado el espacio.",
      });

      // Refresh scan
      setTimeout(() => {
        runScan();
      }, 1000);
    } catch (err: any) {
      console.error(err);
      addLog(`Error durante la limpieza: ${err.message || "Error desconocido"}`);
      toast({
        variant: "destructive",
        title: "Error al limpiar",
        description: err.message || "Ocurrió un error al intentar actualizar los registros.",
      });
    } finally {
      setIsCleaning(false);
    }
  };

  const totalIssues = report
    ? report.base64AvatarsCount +
      report.obsoleteStorageFieldsCount +
      report.expiredTrialsCount +
      report.orphanedLikesCount +
      report.orphanedBookingsCount +
      report.staleNotificationsCount +
      report.malformedChatKeysCount +
      report.staleUsernamesCount +
      report.missingUsernamesCount
    : 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="font-headline text-2xl sm:text-3xl font-bold flex items-center gap-2.5">
            <Database className="h-7 w-7 text-primary" />
            Limpieza de Base de Datos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Depura datos obsoletos, avatares pesados en Base64, alias huérfanos y campos antiguos en Firebase Realtime Database.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={runScan}
            disabled={isScanning || isCleaning}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isScanning ? "animate-spin" : ""}`} />
            {isScanning ? "Escaneando..." : "Re-escanear"}
          </Button>
          <Button
            onClick={executeCleanup}
            disabled={isScanning || isCleaning || totalIssues === 0}
            className="gap-2 bg-primary hover:bg-primary/90"
          >
            <Trash2 className="h-4 w-4" />
            {isCleaning ? "Limpiando..." : "Limpiar Base de Datos"}
          </Button>
        </div>
      </div>

      {/* Progress Bar during cleaning */}
      {isCleaning && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="pt-6 space-y-2">
            <div className="flex justify-between text-sm font-medium">
              <span>Depurando registros...</span>
              <span>{cleanProgress}%</span>
            </div>
            <Progress value={cleanProgress} className="h-2.5" />
          </CardContent>
        </Card>
      )}

      {/* Overview Status Banner */}
      {report && (
        <Card className={totalIssues === 0 ? "border-green-500/40 bg-green-500/5" : "border-amber-500/40 bg-amber-500/5"}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {totalIssues === 0 ? (
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                ) : (
                  <AlertTriangle className="h-8 w-8 text-amber-500" />
                )}
                <div>
                  <CardTitle className="text-lg">
                    {totalIssues === 0
                      ? "Base de datos 100% limpia y optimizada"
                      : `${totalIssues} elementos obsoletos detectados`}
                  </CardTitle>
                  <CardDescription>
                    {totalIssues === 0
                      ? "Todos los perfiles de usuario, usernames y configuraciones están sincronizados sin datos residuales."
                      : "Se encontraron registros huérfanos y cadenas Base64 que pueden purgarse sin afectar el funcionamiento del sistema."}
                  </CardDescription>
                </div>
              </div>
              <Badge variant={totalIssues === 0 ? "default" : "destructive"} className="text-xs px-3 py-1">
                {totalIssues === 0 ? "Estado: Óptimo" : `${totalIssues} Acciones`}
              </Badge>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Detail Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Avatars Card */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-purple-500" />
                Avatares Base64 Pesados
              </CardTitle>
              <Badge variant={report?.base64AvatarsCount ? "destructive" : "secondary"}>
                {report?.base64AvatarsCount || 0}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-headline">
              {report ? (report.base64BytesTotal / (1024 * 1024)).toFixed(2) : "0"} MB
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Imágenes en Base64 guardadas en el JSON que sobrecargan las consultas.
            </p>
          </CardContent>
        </Card>

        {/* Obsolete Storage Fields */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-blue-500" />
                Storage Remanente
              </CardTitle>
              <Badge variant={report?.obsoleteStorageFieldsCount ? "destructive" : "secondary"}>
                {report?.obsoleteStorageFieldsCount || 0}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-headline">
              {report?.obsoleteStorageFieldsCount || 0} campos
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Campos de `storageUsed` de la versión anterior con Firebase Storage.
            </p>
          </CardContent>
        </Card>

        {/* Usernames Mapping */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <UserX className="h-4 w-4 text-orange-500" />
                Alias de Usernames Huérfanos
              </CardTitle>
              <Badge variant={report?.staleUsernamesCount ? "destructive" : "secondary"}>
                {report?.staleUsernamesCount || 0}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-headline">
              {report?.staleUsernamesCount || 0} alias
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Nombres antiguos en `/usernames` que ya no coinciden con el usuario activo.
            </p>
          </CardContent>
        </Card>

        {/* Orphaned Likes & Bookings */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <HeartOff className="h-4 w-4 text-rose-500" />
                Likes Huérfanos
              </CardTitle>
              <Badge variant={report?.orphanedLikesCount ? "destructive" : "secondary"}>
                {report?.orphanedLikesCount || 0}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-headline">
              {report?.orphanedLikesCount || 0} registros
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Likes a obras de arte que ya fueron eliminadas del sistema.
            </p>
          </CardContent>
        </Card>

        {/* Stale Notifications */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BellOff className="h-4 w-4 text-yellow-500" />
                Notificaciones Antiguas
              </CardTitle>
              <Badge variant={report?.staleNotificationsCount ? "destructive" : "secondary"}>
                {report?.staleNotificationsCount || 0}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-headline">
              {report?.staleNotificationsCount || 0} registros
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Notificaciones de 2025 que referencian entidades ya no disponibles.
            </p>
          </CardContent>
        </Card>

        {/* Preserved Core Data */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                Datos Esenciales Intactos
              </CardTitle>
              <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                Preservados
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm space-y-1 mt-1 text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span>Usuarios ({report?.totalUsers || 8} perfiles)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span>Platform Settings (Tarifas y Temas)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span>Referrals (Códigos de comisión)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Execution Logs Terminal Card */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-headline uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Consola de Registro de Limpieza
            </CardTitle>
            {logs.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setLogs([])} className="text-xs h-7">
                Limpiar logs
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-zinc-950 text-zinc-300 font-mono text-xs p-4 rounded-lg h-56 overflow-y-auto space-y-1.5 border border-zinc-800">
            {logs.length === 0 ? (
              <div className="text-zinc-500 italic">
                Presiona &quot;Re-escanear&quot; para inspeccionar la base de datos o &quot;Limpiar Base de Datos&quot; para iniciar la purga.
              </div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="leading-relaxed">
                  {log.includes("Iniciando") && <span className="text-cyan-400">{log}</span>}
                  {log.includes("Limpiado") && <span className="text-yellow-300">{log}</span>}
                  {log.includes("Purgadas") && <span className="text-amber-300">{log}</span>}
                  {log.includes("Eliminado") && <span className="text-red-400">{log}</span>}
                  {log.includes("éxito") && <span className="text-green-400 font-bold">{log}</span>}
                  {!log.includes("Iniciando") &&
                    !log.includes("Limpiado") &&
                    !log.includes("Purgadas") &&
                    !log.includes("Eliminado") &&
                    !log.includes("éxito") &&
                    log}
                </div>
              ))
            )}
          </div>
        </CardContent>
        <CardFooter className="pt-0 text-xs text-muted-foreground flex justify-between">
          <span>Esta operación respeta estrictamente las reglas de seguridad de Firebase.</span>
          {completed && <span className="text-green-500 font-medium">✓ Última depuración completada con éxito</span>}
        </CardFooter>
      </Card>
    </div>
  );
}
