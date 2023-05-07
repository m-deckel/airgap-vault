import { Component } from '@angular/core'
import { PopoverController, Platform, ToastController, AlertController } from '@ionic/angular'

import { MnemonicSecret } from '../../models/secret'
import { ErrorCategory, handleErrorLocal } from '../../services/error-handler/error-handler.service'
import { NavigationService } from '../../services/navigation/navigation.service'
import { SecretsService } from '../../services/secrets/secrets.service'

import { SecretEditPopoverComponent } from './secret-edit-popover/secret-edit-popover.component'
import { TranslateService } from '@ngx-translate/core'
import { ClipboardService } from '@airgap/angular-core'
import { AdvancedModeType, VaultStorageKey, VaultStorageService } from 'src/app/services/storage/storage.service'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { LifehashService } from 'src/app/services/lifehash/lifehash.service'
import { Router } from '@angular/router'

export enum SecretEditAction {
  SET_RECOVERY_KEY
}

@Component({
  selector: 'airgap-secret-edit',
  templateUrl: './secret-edit.page.html',
  styleUrls: ['./secret-edit.page.scss']
})
export class SecretEditPage {
  public isGenerating: boolean = false

  public isAndroid: boolean = false

  public secret: MnemonicSecret

  public lifehashData: string = ''

  public isAppAdvancedMode$: Observable<boolean> = this.storageService
    .subscribe(VaultStorageKey.ADVANCED_MODE_TYPE)
    .pipe(map((res) => res === AdvancedModeType.ADVANCED))

  constructor(
    private readonly popoverCtrl: PopoverController,
    private readonly toastCtrl: ToastController,
    private readonly alertCtrl: AlertController,
    private readonly translateService: TranslateService,
    private readonly clipboardService: ClipboardService,
    private readonly secretsService: SecretsService,
    private readonly navigationService: NavigationService,
    private readonly storageService: VaultStorageService,
    private readonly lifehashService: LifehashService,
    private readonly platform: Platform,
    private readonly router: Router
  ) {
    if (this.navigationService.getState()) {
      this.secret = this.navigationService.getState().secret

      if (!this.secret) {
        this.router.navigate(['/'])
        throw new Error('[SecretEditPage]: No secret found! Navigating to home page.')
      }

      this.isAndroid = this.platform.is('android')

      this.perform(this.navigationService.getState().action)
    }
  }

  public async ngOnInit() {
    this.lifehashData = await this.lifehashService.generateLifehash(this.secret.fingerprint)
  }

  public async confirm(): Promise<void> {
    try {
      await this.secretsService.addOrUpdateSecret(this.secret)
    } catch (error) {
      handleErrorLocal(ErrorCategory.SECURE_STORAGE)(error)

      // TODO: Show error
      return
    }

    await this.dismiss()

    this.navigationService.route('').catch(handleErrorLocal(ErrorCategory.IONIC_NAVIGATION))
  }

  public async dismiss(): Promise<boolean> {
    try {
      return this.navigationService.routeToSecretsTab()
    } catch (error) {
      return false
    }
  }

  public goToSocialRecoverySetup(): void {
    this.navigationService
      .routeWithState('/social-recovery-setup', { secret: this.secret })
      .catch(handleErrorLocal(ErrorCategory.IONIC_NAVIGATION))
  }

  public goToWalletInteraction(): void {
    this.navigationService
      .routeWithState('/interaction-selection-settings', { secret: this.secret, isEdit: true })
      .catch(handleErrorLocal(ErrorCategory.IONIC_NAVIGATION))
  }

  public goToBip85ChildSeed(): void {
    this.navigationService
      .routeWithState('/bip85-generate', { secret: this.secret })
      .catch(handleErrorLocal(ErrorCategory.IONIC_NAVIGATION))
  }

  public async resetRecoveryPassword(): Promise<void> {
    try {
      const recoveryKey = await this.secretsService.resetRecoveryPassword(this.secret)
      this.showRecoveryKeyAlert(recoveryKey)
    } catch (e) {
      this.showToast('secret-edit.secret-recovery-key.reset-error')
    }
  }

  public async showMnemonic() {
    const alert = await this.alertCtrl.create({
      header: this.translateService.instant('secret-edit.show-mnemonic.alert.title'),
      message: this.translateService.instant('secret-edit.show-mnemonic.alert.message'),
      backdropDismiss: false,
      inputs: [
        {
          name: 'understood',
          type: 'checkbox',
          label: this.translateService.instant('secret-edit.show-mnemonic.alert.understood'),
          value: 'understood',
          checked: false
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Ok',
          handler: async (result: string[]) => {
            if (result.includes('understood')) {
              const entropy = await this.secretsService.retrieveEntropyForSecret(this.secret)
              const secret = new MnemonicSecret(entropy)
              this.navigationService.routeWithState('secret-show', { secret: secret }).catch((err) => console.error(err))
            }
          }
        }
      ]
    })
    alert.present()
  }

  public async presentEditPopover(event: Event): Promise<void> {
    const popover: HTMLIonPopoverElement = await this.popoverCtrl.create({
      component: SecretEditPopoverComponent,
      componentProps: {
        secret: this.secret,
        onDelete: (): void => {
          this.dismiss().catch(handleErrorLocal(ErrorCategory.IONIC_MODAL))
        }
      },
      event,
      translucent: true
    })

    popover.present().catch(handleErrorLocal(ErrorCategory.IONIC_MODAL))
  }

  private perform(action: SecretEditAction | undefined): void {
    switch (action) {
      case SecretEditAction.SET_RECOVERY_KEY:
        this.resetRecoveryPassword()
        break
    }
  }

  private async showToast(message: string) {
    const toast: HTMLIonToastElement = await this.toastCtrl.create({
      message: this.translateService.instant(message),
      duration: 1000,
      position: 'top',
      buttons: [
        {
          text: 'Ok',
          role: 'cancel'
        }
      ]
    })
    toast.present().catch(handleErrorLocal(ErrorCategory.IONIC_ALERT))
  }

  private async showRecoveryKeyAlert(recoveryKey: string): Promise<void> {
    const alert: HTMLIonAlertElement = await this.alertCtrl.create({
      header: this.translateService.instant('secret-edit.secret-recovery-key.alert.title'),
      subHeader: this.translateService.instant('secret-edit.secret-recovery-key.description'),
      message: recoveryKey,
      buttons: [
        {
          text: this.translateService.instant('secret-edit.secret-recovery-key.alert.copy'),
          handler: () => {
            this.clipboardService.copy(recoveryKey)
            this.showToast('secret-edit.secret-recovery-key.copied')
          }
        },
        {
          text: this.translateService.instant('secret-edit.secret-recovery-key.alert.done'),
          handler: () => {}
        }
      ]
    })
    alert.present().catch(handleErrorLocal(ErrorCategory.IONIC_ALERT))
  }
}
