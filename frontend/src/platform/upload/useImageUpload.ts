import { ref, onUnmounted } from 'vue'
import type { UploadedImage } from './types'

export function useImageUpload(defaultSrc = '', defaultName = '') {
  const imageSrc = ref(defaultSrc)
  const imageName = ref(defaultName)
  let objectUrl: string | null = null

  function loadFile(file: File) {
    if (!file.type.startsWith('image/')) return
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = URL.createObjectURL(file)
    imageSrc.value = objectUrl
    imageName.value = file.name
  }

  function onFileInput(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) loadFile(file)
    input.value = ''
  }

  function snapshot(): UploadedImage {
    return {
      src: imageSrc.value,
      name: imageName.value,
      isObjectUrl: objectUrl !== null,
    }
  }

  function setImageSource(src: string, name: string) {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = src.startsWith('blob:') ? src : null
    imageSrc.value = src
    imageName.value = name
  }

  /** Empty canvas / next floor without previous underlay. */
  function clearImageSource() {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = null
    imageSrc.value = ''
    imageName.value = ''
  }

  onUnmounted(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  })

  return { imageSrc, imageName, loadFile, onFileInput, snapshot, setImageSource, clearImageSource }
}
