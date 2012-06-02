(function () {

  "use strict";

  var Card, Deck, Hand, Player, Game, CardView, HandView, PlayerView, GameView;

  /**** Models ****/
  Card = Backbone.Model.extend({
    defaults: {
      visible: true
    },
    initialize: function () {
      this.setId();
      this.setValue();
    },
    setId: function () {
      this.set('id', this.get('rank') + this.get('suit'));
    },
    setValue: function () {
      var value, rank = this.get('rank');

      switch (rank) {
      case 'A':
        value = 11;
        break;
      case 'J':
      case 'Q':
      case 'K':
        value = 10;
        break;
      default:
        value = rank;
        break;
      }

      this.set('value', value);
    },
    flip: function () {
      this.set('visible', !this.get('visible'));
    }
  });

  Card.Suits = ['hearts', 'spades', 'clubs', 'diams'];

  Card.Ranks = ['A', 2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K'];

  Deck = Backbone.Collection.extend({
    model: Card,
    initialize: function () {
      this._discarded = [];

      _.each(this.model.Suits, function (suit) {
        _.each(this.model.Ranks, function (rank) {
          this.add({suit: suit, rank: rank});
        }, this);
      }, this);
    },
    draw: function (count) {
      var i, drawn = [];

      count = count || 1;

      for (i = 0; i < count; i += 1) {
        if (!this.length) {
          this.add(this._discarded);
          this.shuffle();
          this._discarded = [];
        }

        drawn.push(this.pop());
      }

      return drawn;
    },
    shuffle: function () {
      this.models = Backbone.Collection.prototype.shuffle.call(this);
      this.trigger('shuffled');

      return this;
    },
    discard: function (cards) {
      this._discarded = this._discarded.concat(cards);
    }
  });

  Hand = Backbone.Collection.extend({
    model: Card,
    value: function () {
      var value, aces;

      value = this.reduce(function (init, card) {
        return init + card.get('value');
      }, 0);

      if (value > 21 && this.contains('A')) {
        aces = this.filter(function (card) {
          return card.get('rank') === 'A';
        });
        value -= (10 * aces.length);
      }

      return value;
    },
    contains: function (comparison) {

      if (comparison instanceof Card) {
        return this.any(function (card) {
          return card.get('id') === comparison.get('id');
        });
      }

      if (typeof (comparison) === 'string' || comparison instanceof String) {
        return this.any(function (card) {
          return card.get('rank') === comparison;
        });
      }
    }
  });

  Player = Backbone.Model.extend({
    initialize: function () {
      this.set('hand', new Hand());

      this.get('hand')
        .on('add', this.handChangeHandler, this)
        .on('remove', this.handChangeHandler, this);
    },
    addCards: function (cards) {
      if (!_.isArray(cards)) {
        cards = [cards];
      }

      _.each(cards, function (card) {
        if (card instanceof Card) {
          this.get('hand').add(card);
        }
      }, this);
    },
    hasBlackjack: function () {
      var hand = this.get('hand');
      return (hand.length === 2 && hand.value() === 21);
    },
    showHand: function () {
      this.get('hand').each(function (card) {
        card.set('visible', true);
      });
    },
    handChangeHandler: function () {
      this.trigger('change:hand');
    }
  });

  Game = Backbone.Model.extend({
    defaults: {
      started: false
    },
    initialize: function () {
      this.players = new Backbone.Collection();

      this.loadDeck();
      this.loadDealer();
      this.loadPlayer();

      this.player.on('change:standing', this.dealerTurn, this);
    },
    loadDeck: function () {
      this.deck = new Deck();
      this.set('deck', this.deck, { silent: true });
      this.deck.shuffle();

      console.log('loaded deck.');
    },
    loadDealer: function () {
      this.dealer = new Player({ name: 'Dealer' });

      this.set('dealer', this.dealer, { silent: true });
      this.players.add(this.dealer);

      console.log('loaded dealer.');
    },
    loadPlayer: function () {
      this.player = new Player({ name: 'You' });

      this.set('player', this.player, { silent: true });
      this.players.add(this.player);

      console.log('loaded player.');
    },
    deal: function () {
      this.reset();

      var dealerCards = this.deck.draw(2);
      dealerCards[1].flip();

      this.dealer.addCards(dealerCards);
      this.player.addCards(this.deck.draw(2));

      this.set('started', true);
      this.update();
    },
    hit: function (player) {
      if (!this.get('started')) {
        return;
      }

      player.addCards(this.deck.draw());

      this.update();
    },
    stand: function (player) {
      if (!this.get('started')) {
        return;
      }

      player.set('standing', true);

      this.update();
    },
    dealerTurn: function () {
      if (!this.get('started')) {
        return;
      }

      this.dealer.showHand();

      // Add better logic. =\
      if (this.dealer.get('hand').value() < 17) {
        console.log('Dealer hits.');
        this.hit(this.dealer);
      } else {
        console.log('Dealer stands.');
        this.stand(this.dealer);
      }
    },
    reset: function () {
      this.set('started', false);
      this.players.each(function (player) {
        this.deck.discard(player.get('hand').models);
        player.get('hand').reset();
        player.set('standing', false, { silent: true });
      }, this);
    },
    endGame: function (winner, reason) {
      this.dealer.showHand();

      this.trigger('endGame', {
        winner: winner,
        reason: reason
      });

      this.set('started', false);
    },
    otherPlayer: function (player) {
      return _.first(this.players.without(player));
    },
    update: function () {
      if (!this.get('started')) {
        return;
      }

      var finished, winner, reason;

      finished = this.players.all(function (player) {
        return player.get('standing');
      });

      if (finished) {
        if (this.player.get('hand').value() ===
            this.dealer.get('hand').value()) {
          winner = null;
          reason = 'There was a tie!';
        } else {
          winner = this.players.max(function (p) {
            return p.get('hand').value();
          });
          reason = winner.get('name') + ' won with a higher hand.';
        }
      } else {
        this.players.each(function (player) {
          var other = this.otherPlayer(player);

          if (player.get('hand').value() > 21) {
            winner = other;
            reason = player.get('name') + ' busted!';
          } else if (player.get('hand').value() === 21) {
            if (other.get('hand').value() === 21) {
              if (player.hasBlackjack()) {
                if (other.hasBlackjack()) {
                  winner = null;
                  reason = 'There was a tie!';
                } else {
                  winner = player;
                  reason = player.get('name') + ' got a blackjack';
                }
              }
            } else {
              winner = player;
              reason = player.get('name') + ' got ' + player.get('hand').value();
            }
          }
        }, this);
      }

      if (winner || reason === "Tie") {
        this.endGame(winner, reason);
      } else if (!reason && this.player.get('standing')) {
        this.dealerTurn();
      }
    }
  });

  /**** Views ****/
  CardView = Backbone.View.extend({
    model: Card,
    tagName: 'div',
    attributes: function () {
      var back, classes;

      back = this.model.get('visible') ? '' : 'back';

      classes = [
        'card',
        'span1',
        this.model.get('suit'),
        back
      ];

      return {
        'class' : classes.join(' '),
        'id' : this.model.get('id')
      };
    },
    initialize: function () {
      this.model.on('change:visible', this.flip, this);
    },
    flip: function () {
      if (this.model.get('visible')) {
        this.$el.removeClass('back');
      } else {
        this.$el.addClass('back');
      }
    },
    render: function () {
      this.$el.html(ich.card(this.view()));
      return this;
    },
    view: function () {
      var suit, rank;

      suit = this.model.get('suit');
      rank = this.model.get('rank');

      return {
        suit: suit,
        suitView : '&' + suit + ';',
        rankView : rank
      };
    }
  });

  HandView = Backbone.View.extend({
    collection: Hand,
    tagName: 'div',
    attributes: {'class': 'hand-area'},
    initialize: function () {
      this.collection
        .on('add', this.addOne, this)
        .on('remove', this.removeOne, this)
        .on('reset', this.removeAll, this);
    },
    render: function () {
      this.collection.each(function (c) {
        this.addOne(c);
      }, this);
      return this;
    },
    addOne: function (card) {
      var newCard = new CardView({ model: card }).render().el;
      this.$el.append(newCard);
    },
    removeOne: function (card) {
      this.$('#' + card.get('id')).remove();
    },
    removeAll: function () {
      this.$el.empty();
    }
  });

  PlayerView = Backbone.View.extend({
    tagName: 'div',
    model: Player,
    initialize: function () {
      this.handView = new HandView({
        el: this.$('.hand-area'),
        collection: this.model.get('hand')
      });
    }
  });

  GameView = Backbone.View.extend({
    model: Game,
    el : '#game',
    alertEl: '#alerts',
    events : {
      'click #deal': 'deal',
      'click #hit': 'hit',
      'click #stand': 'stand'
    },
    initialize: function () {
      this.playerView = new PlayerView({
        el: this.$('.user'),
        model: this.model.get('player')
      });

      this.dealerView = new PlayerView({
        el: this.$('.dealer'),
        model: this.model.get('dealer')
      });

      this.model.on('endGame', this.gameEndHandler, this);
      this.model.deck.on('shuffled', this.shuffleHandler, this);

      this.alert('Welcome to Blackjack.');
      console.log('Blackjack view has been initialized.');
    },
    alert: function (message, type) {
      $(this.alertEl).html(
        '<div class="alert ' + type + '">' +
          message +
          '</div>'
      );
    },
    gameEndHandler: function (details) {
      var success = 'alert-danger';

      if (details.winner && details.winner.get('name') === 'You') {
        success = 'alert-success';
      }

      this.alert('Game over. ' + details.reason, success);

      $('#stand').addClass('disabled');
      $('#hit').addClass('disabled');

      console.log(details.reason);
      console.log('Game has ended.');
    },
    shuffleHandler: function () {
      this.alert('Deck has been shuffled.');
      console.log('Deck has been shuffled..');
    },
    deal: function (event) {
      event.preventDefault();

      $('#stand').removeClass('disabled');
      $('#hit').removeClass('disabled');

      this.alert('Cards have been dealt.', 'alert-info');
      console.log('Cards have been dealt.');

      this.model.deal();
    },
    hit: function (event) {
      event.preventDefault();

      if (!this.model.get('started')) {
        this.alert('Please deal first.');
        console.log('Game has not been started.');
        return;
      }

      this.alert('You hit!');
      console.log('You hit!');

      this.model.hit(this.model.player);
    },
    stand: function (event) {
      event.preventDefault();

      if (!this.model.get('started')) {
        this.alert('Please deal first.');
        console.log('Game has not been started.');
        return;
      }

      console.log('You are standing.');
      this.model.stand(this.model.player);
    }
  });

  return new GameView({ model: new Game() });
}());