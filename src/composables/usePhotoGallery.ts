import { ref, onMounted, watch } from "vue";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource, CameraPhoto } from "@capacitor/camera";
import { Filesystem, FilesystemDirectory } from "@capacitor/filesystem"; // Import directly from Filesystem
import { actionSheetController, isPlatform } from "@ionic/vue";
import { trash, close, text } from "ionicons/icons";
import { Preferences } from "@capacitor/preferences";

export interface Photo {
    filepath: string,
    webViewPath?: string
}

export function usePhotoGallery() {
    const PHOTO_STORAGE = "photos";
    const photos = ref<Photo[]>([]);

    const convertBlobBase64 = (blob: Blob) => new Promise((resolve, reject) => {
        const reader = new FileReader;
        reader.onerror = reject;
        reader.onload = () => {
            resolve(reader.result)
        }
        reader.readAsDataURL(blob)
    })

    const savePicture = async (photo: CameraPhoto, fileName: string): Promise<Photo> => {
        let base64Data: string;

        if (isPlatform('hybrid')) {
            const file = await Filesystem.readFile({
                path: photo.path!
            });
            base64Data = file.data;
        } else {
            const response = await fetch(photo.webPath!);
            const blob = await response.blob();
            base64Data = await convertBlobBase64(blob) as string;
        }

        const savedFile = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: FilesystemDirectory.Data // Ensure FilesystemDirectory.Data is used directly
        })

        if (isPlatform('hybrid')) {
            return {
                filepath: savedFile.uri,
                webViewPath: Capacitor.convertFileSrc(savedFile.uri)
            }
        } else {
            return {
                filepath: fileName,
                webViewPath: photo.webPath
            }
        }
    }

    const cachePhotos = () => {
        Preferences.set({
            key: PHOTO_STORAGE,
            value: JSON.stringify(photos.value)
        })
    }

    const deletePhoto = async (photo: Photo) => {
        photos.value = photos.value.filter(p => p.filepath !== photo.filepath)

        const filename = photo.filepath.substr(photo.filepath.lastIndexOf('/') + 1);
        await Filesystem.deleteFile({
            path: filename,
            directory: FilesystemDirectory.Data // Ensure correct reference to FilesystemDirectory
        })
    }

    const showActionSheet = async (photo: Photo) => {
        const actionSheet = await actionSheetController.create({
            header: 'Photos',
            buttons: [{
                text: 'Delete',
                role: 'destructive',
                icon: trash,
                handler: () => {
                    deletePhoto(photo)
                }
            }, {
                text: 'Cancel',
                icon: close,
                role: 'cancel',
                handler() {

                },
            }]
        })
        await actionSheet.present()
    }

    watch(photos, cachePhotos)

    const loadSaved = async () => {
        const photoList = await Preferences.get({ key: PHOTO_STORAGE });
        const photosInStorage = photoList.value ? JSON.parse(photoList.value) : [];

        if (!isPlatform('hybrid')) {
            for (const photo of photosInStorage) {
                const file = await Filesystem.readFile({
                    path: photo.filepath,
                    directory: FilesystemDirectory.Data
                })

                photo.webViewPath = `data:image/png;base64,${file.data}`;
            }
        }

        photos.value = photosInStorage
    }

    onMounted(loadSaved)

    const takePhoto = async () => {
        const cameraPhoto = await Camera.getPhoto({
            resultType: CameraResultType.Uri,
            source: CameraSource.Camera,
            quality: 100
        });
        const fileName = new Date().getTime() + '.png';
        const savedFileImage = await savePicture(cameraPhoto, fileName)
        photos.value = [savedFileImage, ...photos.value]
    };

    return {
        photos,
        takePhoto,
        deletePhoto,
        showActionSheet
    }
}
