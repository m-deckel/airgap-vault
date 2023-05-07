import { Component } from '@angular/core'

import { MnemonicSecret } from '../../models/secret'
import { ErrorCategory, handleErrorLocal } from '../../services/error-handler/error-handler.service'
import { NavigationService } from '../../services/navigation/navigation.service'

@Component({
  selector: 'airgap-secret-rules',
  templateUrl: './secret-rules.page.html',
  styleUrls: ['./secret-rules.page.scss']
})
export class SecretRulesPage {
  private readonly secret: MnemonicSecret

  public check: { [key: string]: boolean } = {
    one: false,
    two: false,
    three: false,
    four: false,
    five: false,
    six: false
  }

  public understood: boolean = false

  constructor(private readonly navigationService: NavigationService) {
    this.secret = this.navigationService.getState().secret
  }

  public goToShowSecret(): void {
    this.navigationService.routeWithState('secret-show', { secret: this.secret }).catch(handleErrorLocal(ErrorCategory.IONIC_NAVIGATION))
  }

  public onCheckboxChanged(): void {
    setTimeout(() => {
      this.understood = Object.values(this.check).every((value) => value)
    })
  }
}
