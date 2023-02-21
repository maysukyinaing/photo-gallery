import {Injectable} from '@angular/core';
import {Camera, CameraResultType, CameraSource, Photo} from "@capacitor/camera";
import {Directory, Filesystem, ReadFileOptions} from "@capacitor/filesystem";
import {Preferences} from "@capacitor/preferences";
import {Platform} from "@ionic/angular";
import {Capacitor} from "@capacitor/core";

export interface UserPhoto {
  filepath: string;
  webviewPath: string;
}



@Injectable({
  providedIn: 'root'
})
export class PhotoService {

  public photos: UserPhoto[] = []

  private PHOTO_STORAGE: string = 'photos'

  private platform: Platform

  constructor(platform: Platform) {
    this.platform = platform
  }

  public async addNewToGallery() {
    const capturedPhoto = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 100
    })

    const saveImageFile = await this.savePicture(capturedPhoto)
    this.photos.unshift(<UserPhoto>saveImageFile)

    await Preferences.set({
      key: this.PHOTO_STORAGE,
      value: JSON.stringify(this.photos)
    })
  }

  // Save picture to file on device
  private async savePicture(photo: Photo) {
    // Convert photo to base64 format, required by Filesystem API to save
    const base64Data = await this.readAsBase64(photo)

    const fileName = new Date().getTime() + '.jpeg';
    const saveFile = await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Data
    });

    if (this.platform.is('hybrid')) {
      // Display the new image by rewriting the 'file://' path to HTTP
      // Details: https://ionicframework.com/docs/building/webview#file-protocol
      return {
        filepath: saveFile.uri,
        webviewPath: Capacitor.convertFileSrc(saveFile.uri)
      }
    }
    else{
      // Use webPath to display the new image instead of base64 since it's
      // already loaded into memory
      return {
        filepath: fileName,
        webviewPath: photo.webPath
      }
    }
  }

  public async loadSaved() {
    // Retrieve cached photo array data
    const photoList = await Preferences.get({key : this.PHOTO_STORAGE})
    this.photos = JSON.parse(<string>photoList.value) || []

    // Easiest way to detect when running on the web:
    // “when the platform is NOT hybrid, do this”
    if (!this.platform.is('hybrid')) {
      // Display the photo by reading into base64 format
      for (let photo of this.photos) {
        // Read each saved photo's data from the Filesystem
        const readFile = await Filesystem.readFile({
          path: photo.filepath,
          directory: Directory.Data
        })
        // Web platform only: Load the photo as base64 dataionic cap sync
        photo.webviewPath = `data:image/jpeg;base64,${readFile.data}`;
      }
    }
  }

  private async readAsBase64(photo: Photo) {
    // "hybrid" will detect Cordova or Capacitor
    if (this.platform.is('hybrid')) {
      // Read the file into base64 format
      const file = await Filesystem.readFile(<ReadFileOptions>{
        path: photo.path
      })
      return file.data;
    }
    else {
      // Fetch the photo, read as a blob, then convert to base64 format
      const response = await fetch(photo.webPath!);
      const blob = await response.blob();

      return await this.convertBlobToBase64(blob) as string;
    }
  }

  private convertBlobToBase64 = (blob: Blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });

  public async deletePicture(photo: UserPhoto, position: number) {
    // Remove this photo from the Photos reference data array
    this.photos.splice(position, 1);

    // Update photos array cache by overwriting the existing photo array
     await Preferences.set({
       key: this.PHOTO_STORAGE,
       value: JSON.stringify(this.photos)
     });

    // delete photo file from filesystem
    const filename = photo.filepath
      .substr(photo.filepath.lastIndexOf('/') + 1);

    await Filesystem.deleteFile({
      path: filename,
      directory: Directory.Data
    });
  }
}

