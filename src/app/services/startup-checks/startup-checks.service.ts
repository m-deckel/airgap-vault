import { Injectable } from '@angular/core'
import { ModalController } from '@ionic/angular'
import { ComponentRef, ModalOptions } from '@ionic/core'
import { InstallationTypePage } from 'src/app/pages/Installation-type/installation-type.page'
import { OnboardingWelcomePage } from 'src/app/pages/onboarding-welcome/onboarding-welcome.page'

import { DistributionOnboardingPage } from '../../pages/distribution-onboarding/distribution-onboarding.page'
import { IntroductionPage } from '../../pages/introduction/introduction.page'
import { Warning, WarningModalPage } from '../../pages/warning-modal/warning-modal.page'
import { DeviceService } from '../device/device.service'
import { ErrorCategory, handleErrorLocal } from '../error-handler/error-handler.service'
import { SecureStorageService } from '../secure-storage/secure-storage.service'
import { InstallationType, VaultStorageKey, VaultStorageService } from '../storage/storage.service'

export interface Check {
  name: string
  successOutcome: boolean
  check(): Promise<boolean>
  failureConsequence(): Promise<void>
}

@Injectable({
  providedIn: 'root'
})
export class StartupChecksService {
  public checks: Check[]

  constructor(
    private readonly secureStorageService: SecureStorageService,
    private readonly deviceService: DeviceService,
    private readonly modalController: ModalController,
    private readonly storageService: VaultStorageService
  ) {
    this.checks = [
      {
        name: 'rootCheck',
        successOutcome: false,
        check: (): Promise<boolean> => this.deviceService.checkForRoot(),
        failureConsequence: async (): Promise<void> => {
          await this.presentModal(WarningModalPage, { errorType: Warning.ROOT }).catch(handleErrorLocal(ErrorCategory.INIT_CHECK))
        }
      },
      {
        name: 'deviceSecureCheck',
        successOutcome: true,
        check: async (): Promise<boolean> => {
          const result = await this.secureStorageService.isDeviceSecure()

          return Boolean(result.value).valueOf()
        },
        failureConsequence: async (): Promise<void> => {
          await this.presentModal(WarningModalPage, { errorType: Warning.SECURE_STORAGE }).catch(handleErrorLocal(ErrorCategory.INIT_CHECK))
        }
      },
      {
        name: 'disclaimerAcceptedCheck',
        successOutcome: true,
        check: (): Promise<boolean> => this.storageService.get(VaultStorageKey.DISCLAIMER_INITIAL),
        failureConsequence: async (): Promise<void> => {
          await this.presentModal(OnboardingWelcomePage, {}).catch(handleErrorLocal(ErrorCategory.INIT_CHECK))
        }
      },
      {
        name: 'installationType',
        successOutcome: true,
        check: (): Promise<boolean> =>
          this.storageService.get(VaultStorageKey.INSTALLATION_TYPE).then((type) => type !== InstallationType.UNDETERMINED),
        failureConsequence: async (): Promise<void> => {
          await this.presentModal(InstallationTypePage, {}).catch(handleErrorLocal(ErrorCategory.INIT_CHECK))
        }
      },
      {
        name: 'introductionAcceptedCheck',
        successOutcome: true,
        check: (): Promise<boolean> => this.storageService.get(VaultStorageKey.INTRODUCTION_INITIAL),
        failureConsequence: async (): Promise<void> => {
          await this.presentModal(IntroductionPage, {}).catch(handleErrorLocal(ErrorCategory.INIT_CHECK))
        }
      },
      {
        name: 'electronCheck',
        successOutcome: true,
        check: async (): Promise<boolean> => {
          const isElectron: boolean = await deviceService.checkForElectron()
          const hasShownDisclaimer: boolean = await this.storageService.get(VaultStorageKey.DISCLAIMER_ELECTRON)

          return !isElectron || hasShownDisclaimer
        },
        failureConsequence: async (): Promise<void> => {
          await this.presentModal(DistributionOnboardingPage, {}).catch(handleErrorLocal(ErrorCategory.INIT_CHECK))
        }
      }
    ]
  }

  public async presentModal(page: ComponentRef, properties: ModalOptions['componentProps']): Promise<void> {
    return new Promise(async (resolve) => {
      const modal: HTMLIonModalElement = await this.modalController.create({
        component: page,
        componentProps: properties,
        backdropDismiss: false
      })

      modal
        .present()
        .then(() => {
          console.log('check modal presented')
        })
        .catch(handleErrorLocal(ErrorCategory.IONIC_MODAL))

      modal
        .onDidDismiss()
        .then(() => {
          resolve()
        })
        .catch(handleErrorLocal(ErrorCategory.IONIC_MODAL))
    })
  }

  public initChecks(): Promise<void> {
    return new Promise(async (resolve) => {
      for (const check of this.checks) {
        if (+(await check.check()) !== +check.successOutcome) {
          await check.failureConsequence()
        }
      }
      resolve()
    })
  }
}
