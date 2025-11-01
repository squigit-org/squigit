/**
 * Copyright (C) 2025  a7mddra-spatialshot
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/

export function createPremiumView(page, electronAPI, showFeedbackMessage) {
  const premiumView = document.createElement('div');
  premiumView.className = 'premium-view';
  premiumView.id = 'premiumView';

  const premiumHeader = document.createElement('div');
  premiumHeader.className = 'premium-header';

  const backBtn = document.createElement('button');
  backBtn.className = 'back-btn';
  backBtn.id = 'backPremiumBtn';
  const backIcon = document.createElement('i');
  backIcon.className = 'fas fa-arrow-left';
  backBtn.appendChild(backIcon);

  const premiumTitle = document.createElement('h2');
  premiumTitle.textContent = 'Spatial Shot Premium';

  premiumHeader.appendChild(backBtn);
  premiumHeader.appendChild(premiumTitle);

  const premiumContent = document.createElement('div');
  premiumContent.className = 'premium-content';

  const premiumBg = document.createElement('div');
  premiumBg.className = 'premium-bg';

  // Pro Plan Card
  const proCard = createPlanCard('pro', 'Pro Plan', '$4.99', '/ month', [
    'Unlimited spatial shots',
    'Unlimited AI chat quota',
    'Priority access to new features'
  ], 'Upgrade to Pro', 'fas fa-crown', 'proUpgradeBtn', true);

  // Starter Plan Card
  const starterCard = createPlanCard('starter', 'Starter Plan', '$1.99', '/ month', [
    '20 spatial shots per month',
    'Unlimited AI chat quota'
  ], 'Upgrade to Starter', 'fas fa-star', 'starterUpgradeBtn');

  // Free Plan Card
  const freeCard = createPlanCard('free', 'Free Plan', '$0.00', '/ month', [
    '2 spatial shots per day',
    'Up to 3 AI prompts per image'
  ], 'Current Plan', 'fas fa-user', null, false, true);

  premiumContent.appendChild(premiumBg);
  premiumContent.appendChild(proCard);
  premiumContent.appendChild(starterCard);
  premiumContent.appendChild(freeCard);

  premiumView.appendChild(premiumHeader);
  premiumView.appendChild(premiumContent);

  // Event listeners
  backBtn.addEventListener('click', () => {
    premiumView.classList.remove('active');
    page.classList.remove('subview-active');
  });

  // Upgrade buttons
  const upgradeBtns = [document.getElementById('proUpgradeBtn'), document.getElementById('starterUpgradeBtn')];
  upgradeBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', function() {
        this.style.transform = 'scale(0.95)';
        setTimeout(() => this.style.transform = '', 200);

        const ripple = document.createElement('div');
        ripple.style.position = 'absolute';
        ripple.style.borderRadius = '50%';
        ripple.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        ripple.style.width = '0';
        ripple.style.height = '0';
        ripple.style.left = '50%';
        ripple.style.top = '50%';
        ripple.style.transform = 'translate(-50%, -50%)';
        ripple.style.animation = 'ripple 0.6s linear';
        this.appendChild(ripple);

        if (!document.querySelector('#ripple-animation')) {
          const style = document.createElement('style');
          style.id = 'ripple-animation';
          style.textContent = `
            @keyframes ripple {
              to {
                width: 200px;
                height: 200px;
                opacity: 0;
              }
            }
          `;
          document.head.appendChild(style);
        }

        setTimeout(() => ripple.remove(), 600);

        const planName = this.id.includes('pro') ? 'Pro' : 'Starter';
        electronAPI.upgradeToPlan(planName);
        showFeedbackMessage(`${planName} upgrade initiated`, 'done');
      });
    }
  });

  return premiumView;
}

function createPlanCard(className, title, price, period, features, btnText, iconClass, btnId, hasBadge = false, isCurrent = false) {
  const card = document.createElement('div');
  card.className = `plan-card ${className}`;

  const header = document.createElement('div');
  header.className = 'plan-header';

  const iconDiv = document.createElement('div');
  iconDiv.className = 'plan-icon';
  const icon = document.createElement('i');
  icon.className = iconClass;
  iconDiv.appendChild(icon);

  const planTitle = document.createElement('h2');
  planTitle.className = 'plan-title';
  planTitle.textContent = title;

  header.appendChild(iconDiv);
  header.appendChild(planTitle);

  if (hasBadge) {
    const badge = document.createElement('div');
    badge.className = 'plan-badge';
    badge.textContent = 'Popular';
    header.appendChild(badge);
  }

  if (isCurrent) {
    const currentBadge = document.createElement('div');
    currentBadge.className = 'current-plan-badge';
    currentBadge.textContent = 'Current';
    header.appendChild(currentBadge);
  }

  const pricing = document.createElement('div');
  pricing.className = 'plan-pricing';
  const priceDiv = document.createElement('div');
  priceDiv.className = 'price';
  priceDiv.textContent = price;
  const periodDiv = document.createElement('div');
  periodDiv.className = 'price-period';
  periodDiv.textContent = period;
  pricing.appendChild(priceDiv);
  pricing.appendChild(periodDiv);

  const featuresList = document.createElement('ul');
  featuresList.className = 'plan-features';
  features.forEach(feature => {
    const li = document.createElement('li');
    const check = document.createElement('i');
    check.className = 'fas fa-check';
    li.appendChild(check);
    li.appendChild(document.createTextNode(` ${feature}`));
    featuresList.appendChild(li);
  });

  const planBtn = document.createElement('button');
  planBtn.className = 'plan-btn';
  if (btnId) planBtn.id = btnId;
  const btnIcon = document.createElement('i');
  btnIcon.className = isCurrent ? 'fas fa-check' : (btnId && btnId.includes('pro') ? 'fas fa-rocket' : 'fas fa-bolt');
  planBtn.appendChild(btnIcon);
  planBtn.appendChild(document.createTextNode(` ${btnText}`));
  if (isCurrent) planBtn.disabled = true;

  card.appendChild(header);
  card.appendChild(pricing);
  card.appendChild(featuresList);
  card.appendChild(planBtn);

  return card;
}
