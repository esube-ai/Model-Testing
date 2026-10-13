"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon, SwitchCameraIcon } from "./Icons";
import { cls, Modal } from "./ui";

interface Props {
  onCapture: (photo: Blob) => void;
  onClose: () => void;
}

function cameraError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera access was blocked. Allow the camera for this site in your browser's settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device.";
  if (name === "NotReadableError") return "The camera is being used by another app. Close it and try again.";
  return "The camera couldn't be started.";
}

/** Take a photo with the device camera. Nothing is uploaded until the tester chooses "Use photo". */
export function CameraDialog({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [canSwitch, setCanSwitch] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      setReady(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("The camera needs a secure (https) page and a browser that supports it.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setError(null);
        setReady(true);
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setCanSwitch(devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch (e) {
        if (!cancelled) setError(cameraError(e));
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => blob && setPhoto({ blob, url: URL.createObjectURL(blob) }), "image/jpeg", 0.9);
  }

  return (
    <Modal title="Take a photo" description="The photo is added to your message. It's only sent when you send the message." onClose={onClose} width="40rem" testId="camera-dialog">
      <div className="relative overflow-hidden rounded-xl bg-black">
        {/* The live preview stays mounted so the stream keeps running while reviewing a photo. */}
        <video ref={videoRef} playsInline muted className={`aspect-video w-full object-contain ${photo ? "hidden" : ""}`} aria-label="Camera preview" />
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt="Captured photo" className="aspect-video w-full object-contain" />
        )}
        {!ready && !error && !photo && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starting camera…</p>}
        {error && (
          <p role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">
            {error}
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {photo ? (
          <>
            <button type="button" className={cls.secondary} onClick={() => setPhoto(null)}>
              Retake
            </button>
            <button
              type="button"
              className={cls.primary}
              onClick={() => {
                onCapture(photo.blob);
                onClose();
              }}
            >
              Use photo
            </button>
          </>
        ) : (
          <>
            {canSwitch ? (
              <button type="button" className={cls.secondary} onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} aria-label="Switch camera">
                <SwitchCameraIcon /> Switch
              </button>
            ) : (
              <span />
            )}
            <button type="button" className={cls.primary} onClick={capture} disabled={!ready}>
              <CameraIcon /> Capture
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
