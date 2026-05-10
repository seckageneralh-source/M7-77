const EventEmitter = require('events');

// M7-77 AWS Data Exchange
// Packages M7 intelligence into data products
// Enterprise subscribers get automatic delivery — every delivery bills them

const DOMAIN_PRICING = {
  finance:    1.00,
  government: 0.80,
  healthcare: 0.75,
  health:     0.75,
  ai:         0.50,
  energy:     0.40,
  tech:       0.20,
  social:     0.10
};

class AWSExchange extends EventEmitter {
  constructor(treasury) {
    super();
    this.treasury      = treasury;
    this.subscribers   = [];
    this.deliveries    = [];
    this.totalDeliveries = 0;
    this.totalBilled   = 0;
    console.log('📦 AWS Data Exchange module initialized');
  }

  // Add an enterprise subscriber
  addSubscriber(sub) {
    this.subscribers.push({
      id:        'sub-' + Date.now(),
      name:      sub.name,
      domains:   sub.domains || ['all'],
      tier:      sub.tier || 'standard',
      addedAt:   Date.now(),
      status:    'ACTIVE',
      totalBilled: 0,
      deliveries:  0
    });
    console.log('✅ AWS Exchange subscriber added:', sub.name);
  }

  // Package events into a data product delivery
  packageDelivery(events, domain) {
    const price    = DOMAIN_PRICING[domain] || 0.10;
    const count    = events.length;
    const billedAmount = parseFloat(((count / 10) * price).toFixed(4));

    return {
      deliveryId:  'del-' + Date.now() + '-' + Math.random().toString(36).substr(2,6),
      timestamp:   Date.now(),
      domain,
      eventCount:  count,
      billedAmount,
      pricePerTen: price,
      product: {
        name:      `M7-77 ${domain.toUpperCase()} Intelligence Feed`,
        version:   '1.0',
        format:    'JSON',
        events:    events.slice(0, 50).map(e => ({
          id:        e.id,
          domain:    e.domain,
          type:      e.type,
          timestamp: e.timestamp,
          insight:   `M7 processed ${e.type} in ${e.domain}`,
          value:     price
        }))
      }
    };
  }

  // Deliver to all active subscribers watching this domain
  deliver(events, domain) {
    if (!events || events.length === 0) return;

    const delivery = this.packageDelivery(events, domain);

    // Bill each subscriber watching this domain
    this.subscribers
      .filter(s => s.status === 'ACTIVE' && (s.domains.includes('all') || s.domains.includes(domain)))
      .forEach(sub => {
        sub.totalBilled += delivery.billedAmount;
        sub.deliveries++;
        this.totalBilled += delivery.billedAmount;

        // Route to treasury
        if (this.treasury) {
          this.treasury.credit(delivery.billedAmount, {
            id:     delivery.deliveryId,
            domain: domain,
            type:   'AWS_EXCHANGE_DELIVERY',
            sub:    sub.name
          });
        }

        console.log(`📤 AWS Delivery → ${sub.name} | ${domain} | $${delivery.billedAmount}`);
      });

    this.totalDeliveries++;
    this.deliveries.push(delivery);
    if (this.deliveries.length > 200) this.deliveries.shift();

    this.emit('delivery', delivery);
    return delivery;
  }

  // Auto-deliver every time a batch of events comes in
  autoDeliver(events) {
    // Group events by domain and deliver each group
    const byDomain = {};
    events.forEach(e => {
      if (!byDomain[e.domain]) byDomain[e.domain] = [];
      byDomain[e.domain].push(e);
    });

    Object.entries(byDomain).forEach(([domain, domainEvents]) => {
      this.deliver(domainEvents, domain);
    });
  }

  getStatus() {
    return {
      subscribers:     this.subscribers.length,
      totalDeliveries: this.totalDeliveries,
      totalBilled:     parseFloat(this.totalBilled.toFixed(2)),
      recentDeliveries: this.deliveries.slice(-10).reverse(),
      subscriberList:  this.subscribers.map(s => ({
        name:        s.name,
        domains:     s.domains,
        tier:        s.tier,
        deliveries:  s.deliveries,
        totalBilled: parseFloat(s.totalBilled.toFixed(2)),
        status:      s.status
      }))
    };
  }
}

module.exports = AWSExchange;
